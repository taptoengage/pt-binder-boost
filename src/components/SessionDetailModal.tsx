import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Phone, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useSessionOverlapCheck, validateOverlap } from '@/hooks/useSessionOverlapCheck';

// Generate time options with 30-minute intervals
const generateTimeOptions = () => {
  const times = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      times.push(timeString);
    }
  }
  return times;
};
const timeOptions = generateTimeOptions();

// Define Zod Schema for editing a session
const EditSessionSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'cancelled_late', 'cancelled_early']),
  session_date: z.date(),
  session_time: z.string().min(1, 'Session time is required.'),
});

type EditSessionFormData = z.infer<typeof EditSessionSchema>;

interface SessionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any; // TODO: Replace 'any' with proper Session type
}

export default function SessionDetailModal({ isOpen, onClose, session }: SessionDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch client contact details
  const { data: clientContact, isLoading: isLoadingContact, error: contactError } = useQuery({
    queryKey: ['clientContact', session?.clients?.id],
    queryFn: async () => {
      if (!session?.clients?.id) return null;
      const { data, error } = await supabase
        .from('clients')
        .select('phone_number, email')
        .eq('id', session.clients.id)
        .single();

      if (error) {
        console.error("Error fetching client contact:", error);
        throw error;
      }
      return data;
    },
    enabled: !!session?.clients?.id && !isEditing, // Only fetch when ID exists and not in edit mode
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const form = useForm<EditSessionFormData>({
    resolver: zodResolver(EditSessionSchema),
    defaultValues: {
      status: session?.status || 'scheduled',
      session_date: session?.session_date ? new Date(session.session_date) : new Date(),
      session_time: session?.session_date ? format(new Date(session.session_date), 'HH:mm') : '09:00',
    },
    mode: 'onChange'
  });

  // Watch form fields to trigger overlap query
  const watchedSessionDate = form.watch('session_date');
  const watchedSessionTime = form.watch('session_time');
  const watchedSessionStatus = form.watch('status');

  // Use the reusable overlap check hook
  const { isLoadingOverlaps, overlappingSessionsCount } = useSessionOverlapCheck({
    trainerId: user?.id,
    proposedDate: watchedSessionDate,
    proposedTime: watchedSessionTime,
    proposedStatus: watchedSessionStatus,
    sessionIdToExclude: session?.id, // Pass current session ID to exclude!
    enabled: isEditing, // Only enable this hook when in edit mode
  });

  // Reset form when modal opens or session changes to ensure correct default values
  useEffect(() => {
    if (isOpen && session) {
      form.reset({
        status: session.status || 'scheduled',
        session_date: session.session_date ? new Date(session.session_date) : new Date(),
        session_time: session.session_date ? format(new Date(session.session_date), 'HH:mm') : '09:00',
      });
      setIsEditing(false); // Always start in view mode
    }
  }, [isOpen, session, form]);

  // Add a useEffect to trigger validation when overlap data changes
  useEffect(() => {
    if (overlappingSessionsCount !== undefined && !isLoadingOverlaps && watchedSessionStatus === 'scheduled') {
        // Manually set the overlap error if detected
        if (overlappingSessionsCount > 0) {
          form.setError('session_time', {
            type: 'custom',
            message: 'This time slot overlaps with another scheduled session.',
          });
        } else {
          form.clearErrors('session_time');
        }
    } else if (watchedSessionStatus !== 'scheduled' && !isLoadingOverlaps) {
        // Clear any overlap errors if status is not scheduled
        form.clearErrors('session_time');
    }
  }, [overlappingSessionsCount, isLoadingOverlaps, watchedSessionStatus, form]);

  const onSubmit = async (data: EditSessionFormData) => {
    try {
      // Combine date and time into a proper timestamp for Supabase
      const [hours, minutes] = data.session_time.split(':').map(Number);
      const sessionDateTime = new Date(data.session_date);
      sessionDateTime.setHours(hours, minutes, 0, 0);

      const payload = {
        status: data.status,
        session_date: sessionDateTime.toISOString(), // Save as ISO string
      };

      const { error } = await supabase
        .from('sessions')
        .update(payload)
        .eq('id', session.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Session updated successfully!',
      });
      
      setIsEditing(false);
      onClose(); // Close the modal
      // Invalidate trainer's sessions query to refresh the schedule view
      queryClient.invalidateQueries({ queryKey: ['trainerSessions', user?.id] });
    } catch (error: any) {
      console.error("Error updating session:", error);
      toast({
        title: 'Error',
        description: `Failed to update session: ${error.message || 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  if (!isOpen || !session) return null; // Don't render if not open or no session

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] md:max-w-md">
        <DialogHeader>
          <DialogTitle>Session Details</DialogTitle>
          <DialogDescription>
            {isEditing ? "Edit this session's details." : "Information about this scheduled session."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="py-4 space-y-4">
            <p><strong>Session ID:</strong> {session.id}</p>
            <p><strong>Client:</strong> {session.clients?.name || 'N/A'}</p>

            {/* Contact Buttons */}
            {!isEditing && clientContact && (
              <div className="flex space-x-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={isLoadingContact || !clientContact.phone_number}
                >
                  <a href={`tel:${clientContact.phone_number}`}>
                    <Phone className="w-4 h-4 mr-2" /> Call Client
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={isLoadingContact || !clientContact.email}
                >
                  <a href={`mailto:${clientContact.email}`}>
                    <Mail className="w-4 h-4 mr-2" /> Email Client
                  </a>
                </Button>
              </div>
            )}
            {!isEditing && isLoadingContact && (
              <p className="text-sm text-muted-foreground">Loading client contact...</p>
            )}
            {!isEditing && contactError && (
              <p className="text-sm text-destructive">Could not load client contact.</p>
            )}

            <p><strong>Service:</strong> {session.service_types?.name || 'N/A'}</p>

            {/* Status Field */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  {isEditing ? (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled_late">Cancelled Late</SelectItem>
                        <SelectItem value="cancelled_early">Cancelled Early</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-sm font-medium">
                      <Badge className={cn(
                        { 'bg-green-500': session.status === 'scheduled' },
                        { 'bg-gray-500': session.status === 'completed' },
                        { 'bg-red-500': session.status === 'cancelled' || session.status === 'cancelled_late' },
                        { 'bg-orange-500': session.status === 'cancelled_early' }
                      )}>
                        {session.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Badge>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Session Date Field */}
            <FormField
              control={form.control}
              name="session_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Session Date</FormLabel>
                  {isEditing ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="text-sm font-medium">{format(new Date(session.session_date), 'PPP')}</div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Session Time Field */}
            <FormField
              control={form.control}
              name="session_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Time</FormLabel>
                  {isEditing ? (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select session time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[200px] overflow-y-auto">
                        {timeOptions.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-sm font-medium">{format(new Date(session.session_date), 'p')}</div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {session.notes && (
              <p><strong>Notes:</strong> {session.notes}</p>
            )}

            <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-2 mt-6">
              {isEditing ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)} className="mb-2 sm:mb-0">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isValid || isLoadingOverlaps} className="mb-2 sm:mb-0">
                    {form.formState.isSubmitting ? "Saving..." :
                     isLoadingOverlaps ? "Checking Overlaps..." :
                     "Save Changes"}
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setIsEditing(true)} className="mb-2 sm:mb-0">
                    Edit Session
                  </Button>
                  <Button type="button" onClick={onClose} className="mb-2 sm:mb-0">Close</Button>
                </>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}