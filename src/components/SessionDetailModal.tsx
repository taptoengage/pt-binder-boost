import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { format, differenceInHours, isBefore, parse, addMinutes, isWithinInterval } from 'date-fns';
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
import ConfirmAvailabilityOverrideModal from '@/components/ConfirmAvailabilityOverrideModal';

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
  const [isPenaltyWaived, setIsPenaltyWaived] = useState(false);
  // NEW STATE for availability override modal
  const [showAvailabilityOverrideConfirm, setShowAvailabilityOverrideConfirm] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<EditSessionFormData | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const DEFAULT_SESSION_DURATION_MINUTES = 60;

  // Fetch complete session data with joins
  const { data: fullSessionData, isLoading: isLoadingSession, error: sessionError } = useQuery({
    queryKey: ['sessionDetail', session?.id],
    queryFn: async () => {
      if (!session?.id) return null;
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          clients:client_id (
            id,
            name,
            phone_number,
            email
          ),
          service_types:service_type_id (
            id,
            name
          )
        `)
        .eq('id', session.id)
        .single();

      if (error) {
        console.error("Error fetching session details:", error);
        throw error;
      }
      return data;
    },
    enabled: isOpen && !!session?.id,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  // Use the fetched data or fallback to the session prop
  const sessionData = fullSessionData || session;

  const form = useForm<EditSessionFormData>({
    resolver: zodResolver(EditSessionSchema),
    defaultValues: {
      status: 'scheduled',
      session_date: new Date(),
      session_time: '09:00',
    },
    mode: 'onChange'
  });

  // Watch form fields to trigger overlap query
  const watchedSessionDate = form.watch('session_date');
  const watchedSessionTime = form.watch('session_time');
  const watchedSessionStatus = form.watch('status');

  // NEW: Fetch trainer's recurring availability templates
  const { data: recurringTemplates, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['trainerAvailabilityTemplates', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('trainer_availability_templates')
        .select('*')
        .eq('trainer_id', user.id)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) {
        console.error("Error fetching templates:", error);
        throw error;
      }
      return data || [];
    },
    enabled: !!user?.id && isEditing, // Only enable if editing
    staleTime: 60 * 1000,
  });

  // NEW: Fetch trainer's one-off availability exceptions
  const { data: exceptions, isLoading: isLoadingExceptions } = useQuery({
    queryKey: ['trainerAvailabilityExceptions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('trainer_availability_exceptions')
        .select('*')
        .eq('trainer_id', user.id)
        .order('exception_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) {
        console.error("Error fetching exceptions:", error);
        throw error;
      }
      return data || [];
    },
    enabled: !!user?.id && isEditing, // Only enable if editing
    staleTime: 60 * 1000,
  });

  // Use the reusable overlap check hook
  const { isLoadingOverlaps, overlappingSessionsCount } = useSessionOverlapCheck({
    trainerId: user?.id,
    proposedDate: watchedSessionDate,
    proposedTime: watchedSessionTime,
    proposedStatus: watchedSessionStatus,
    sessionIdToExclude: sessionData?.id, // Pass current session ID to exclude!
    enabled: isEditing, // Only enable this hook when in edit mode
  });

  // Reset form when modal opens or session data changes to ensure correct default values
  useEffect(() => {
    if (isOpen && sessionData) {
      form.reset({
        status: sessionData.status || 'scheduled',
        session_date: sessionData.session_date ? new Date(sessionData.session_date) : new Date(),
        session_time: sessionData.session_date ? format(new Date(sessionData.session_date), 'HH:mm') : '09:00',
      });
      setIsEditing(false); // Always start in view mode
    }
  }, [isOpen, sessionData, form]);

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

  // Process availability ranges for the proposed date
  const finalAvailabilityRangesForProposedDate = React.useMemo(() => {
    const ranges: Array<{ start: Date; end: Date }> = [];
    const proposedDate = form.watch('session_date'); // Use proposed session date for reference
    if (!proposedDate) return ranges;

    const dayKey = format(proposedDate, 'yyyy-MM-dd');
    const dayOfWeekLowercase = format(proposedDate, 'EEEE').toLowerCase();

    // --- 1. Get Recurring Ranges for this day ---
    let currentDayRanges: Array<{ start: Date; end: Date }> = [];
    (recurringTemplates || []).forEach(template => {
        if (template.day_of_week === dayOfWeekLowercase) {
            const start = parse(template.start_time, 'HH:mm', proposedDate); // Use proposedDate
            const end = parse(template.end_time, 'HH:mm', proposedDate);     // Use proposedDate
            currentDayRanges.push({ start, end });
        }
    });

    // Sort and merge recurring ranges
    currentDayRanges.sort((a,b) => a.start.getTime() - b.start.getTime());
    let mergedRecurringRanges: Array<{start: Date; end: Date}> = [];
    if (currentDayRanges.length > 0) {
        let lastMerged = currentDayRanges[0];
        for (let i = 1; i < currentDayRanges.length; i++) {
            if (currentDayRanges[i].start.getTime() <= lastMerged.end.getTime()) {
                lastMerged.end = new Date(Math.max(lastMerged.end.getTime(), currentDayRanges[i].end.getTime()));
            } else {
                mergedRecurringRanges.push(lastMerged);
                lastMerged = currentDayRanges[i];
            }
        }
        mergedRecurringRanges.push(lastMerged);
    }
    // Start with merged recurring ranges as base for this day
    let effectiveAvailableRanges = mergedRecurringRanges;

    // --- 2. Apply Exceptions for this specific date ---
    const exceptionsForProposedDate = (exceptions || []).filter(
        ex => format(new Date(ex.exception_date), 'yyyy-MM-dd') === dayKey
    );

    exceptionsForProposedDate.forEach(exception => {
        const exceptionDateRef = new Date(exception.exception_date); // Parse times relative to exception date

        if (exception.exception_type === 'unavailable_full_day') {
            effectiveAvailableRanges = []; // Full day unavailable overrides everything
        } else if (exception.exception_type === 'unavailable_partial_day') {
            const unavailableStart = parse(exception.start_time || '00:00', 'HH:mm', exceptionDateRef);
            const unavailableEnd = parse(exception.end_time || '23:59', 'HH:mm', exceptionDateRef);

            const newRangesAfterPartialRemoval: Array<{start: Date; end: Date}> = [];
            effectiveAvailableRanges.forEach(range => {
                if (range.start < unavailableEnd && range.end > unavailableStart) {
                    if (range.start < unavailableStart) {
                        newRangesAfterPartialRemoval.push({ start: range.start, end: unavailableStart });
                    }
                    if (range.end > unavailableEnd) {
                        newRangesAfterPartialRemoval.push({ start: unavailableEnd, end: range.end });
                    }
                } else {
                    newRangesAfterPartialRemoval.push(range);
                }
            });
            effectiveAvailableRanges = newRangesAfterPartialRemoval;

        } else if (exception.exception_type === 'available_extra_slot') {
            const extraStart = parse(exception.start_time || '00:00', 'HH:mm', exceptionDateRef);
            const extraEnd = parse(exception.end_time || '23:59', 'HH:mm', exceptionDateRef);

            effectiveAvailableRanges.push({ start: extraStart, end: extraEnd });

            effectiveAvailableRanges.sort((a,b) => a.start.getTime() - b.start.getTime());
            const tempMerged: Array<{start: Date; end: Date}> = [];
            if(effectiveAvailableRanges.length > 0) {
                let lastTempMerged = effectiveAvailableRanges[0];
                for(let i = 1; i < effectiveAvailableRanges.length; i++) {
                    if (effectiveAvailableRanges[i].start.getTime() <= lastTempMerged.end.getTime()) {
                        lastTempMerged.end = new Date(Math.max(lastTempMerged.end.getTime(), effectiveAvailableRanges[i].end.getTime()));
                    } else {
                        tempMerged.push(lastTempMerged);
                        lastTempMerged = effectiveAvailableRanges[i];
                    }
                }
                tempMerged.push(lastTempMerged);
            }
            effectiveAvailableRanges = tempMerged;
        }
    });

    return effectiveAvailableRanges;
  }, [form.watch('session_date'), recurringTemplates, exceptions]);

  // Check if proposed session is outside availability
  const isOutsideAvailability = React.useMemo(() => {
    const proposedDate = form.watch('session_date');
    const proposedTime = form.watch('session_time');
    const proposedStatus = form.watch('status');

    if (!proposedDate || !proposedTime || proposedStatus !== 'scheduled') {
        return false;
    }
    const proposedSessionStart = parse(proposedTime, 'HH:mm', proposedDate);
    const proposedSessionEnd = addMinutes(proposedSessionStart, DEFAULT_SESSION_DURATION_MINUTES);

    // Check if session falls within any of the final available ranges for this day
    const fallsWithinAvailableBlock = finalAvailabilityRangesForProposedDate.some(block =>
      proposedSessionStart >= block.start && proposedSessionEnd <= block.end
    );

    return !fallsWithinAvailableBlock;
  }, [form.watch('session_date'), form.watch('session_time'), form.watch('status'), finalAvailabilityRangesForProposedDate]);

  // Helper to proceed with save (called by onSubmit and handleConfirmOverride)
  const proceedWithSave = async (data: EditSessionFormData) => {
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
        .eq('id', sessionData.id);

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

  // MODIFIED onSubmit: Intercept for availability override
  const onSubmit = async (data: EditSessionFormData) => {
    // Manual validation check
    const isValid = await form.trigger();
    if (!isValid || isLoadingOverlaps) {
      toast({ title: 'Validation Error', description: 'Please correct the errors before saving.', variant: 'destructive' });
      return;
    }

    // NEW: Soft validation for availability override
    if (form.watch('status') === 'scheduled' && isOutsideAvailability) {
      setPendingSubmitData(data); // Store data to use after confirmation
      setShowAvailabilityOverrideConfirm(true);
      return; // INTERCEPT HERE
    }

    // If no override, proceed directly
    await proceedWithSave(data);
  };

  // NEW: Handle confirmation from override modal
  const handleConfirmAvailabilityOverride = async () => {
    setShowAvailabilityOverrideConfirm(false); // Close confirmation modal
    if (pendingSubmitData) {
      await proceedWithSave(pendingSubmitData); // Proceed with original save
      setPendingSubmitData(null); // Clear pending data
    } else {
      toast({ title: 'Error', description: 'No session data to confirm.', variant: 'destructive' });
      onClose();
    }
  };


  // New cancellation handler using the edge function
  const handleCancellation = async (penalize: boolean) => {
    if (!sessionData?.id || !user?.id) {
      toast({ title: 'Error', description: 'Session ID or trainer ID is missing for cancellation.', variant: 'destructive' });
      return;
    }

    const sessionStart = new Date(sessionData.session_date);
    const isLateCancel = differenceInHours(sessionStart, new Date()) <= 24;

    // Handle the override logic
    const finalPenalize = isLateCancel && penalize; // Only penalize if it's a late cancel AND the override flag is true

    try {
      // Prepare the payload for the Edge Function
      const payload = {
        sessionId: sessionData.id,
        penalize: finalPenalize
      };

      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const { error } = await supabase.functions.invoke('cancel-client-session', {
        body: payload,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw new Error(error.message || 'Failed to cancel session');

      toast({
        title: 'Success',
        description: 'Session cancelled successfully!',
      });

      onClose(); // Close the modal
      queryClient.invalidateQueries({ queryKey: ['trainerSessions', user.id] }); // Refresh schedule
    } catch (error: any) {
      toast({
        title: 'Error',
        description: `Failed to cancel session: ${error.message}`,
        variant: 'destructive',
      });
      console.error("Error cancelling session:", error);
    }
  };

  if (!isOpen || !session) return null; // Don't render if not open or no session

  // Show loading state while fetching session data
  if (isLoadingSession) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px] md:max-w-md">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
            <DialogDescription>Loading session information...</DialogDescription>
          </DialogHeader>
          <div className="py-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-sm text-muted-foreground">Loading session details...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Show error state if session data failed to load
  if (sessionError) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px] md:max-w-md">
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
            <DialogDescription>Failed to load session details.</DialogDescription>
          </DialogHeader>
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">Could not load session information. Please try again.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
            <p><strong>Session ID:</strong> {sessionData.id}</p>
            <p><strong>Client:</strong> {sessionData.clients?.name || 'N/A'}</p>

            {/* Contact Buttons */}
            {!isEditing && sessionData.clients && (
              <div className="flex space-x-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={!sessionData.clients.phone_number}
                >
                  <a href={`tel:${sessionData.clients.phone_number}`}>
                    <Phone className="w-4 h-4 mr-2" /> Call Client
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={!sessionData.clients.email}
                >
                  <a href={`mailto:${sessionData.clients.email}`}>
                    <Mail className="w-4 h-4 mr-2" /> Email Client
                  </a>
                </Button>
              </div>
            )}

            <p><strong>Service:</strong> {sessionData.service_types?.name || 'N/A'}</p>

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
                         { 'bg-green-500': sessionData.status === 'scheduled' },
                         { 'bg-gray-500': sessionData.status === 'completed' },
                         { 'bg-red-500': sessionData.status === 'cancelled' || sessionData.status === 'cancelled_late' },
                         { 'bg-orange-500': sessionData.status === 'cancelled_early' }
                       )}>
                         {sessionData.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
                    <div className="text-sm font-medium">{format(new Date(sessionData.session_date), 'PPP')}</div>
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
                    <div className="text-sm font-medium">{format(new Date(sessionData.session_date), 'p')}</div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {sessionData.notes && (
              <p><strong>Notes:</strong> {sessionData.notes}</p>
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

                  {/* Conditional Cancellation Logic */}
                  {(() => {
                    const sessionStart = sessionData?.session_date ? new Date(sessionData.session_date) : null;
                    const isLateCancel = sessionStart ? differenceInHours(sessionStart, new Date()) <= 24 : false;
                    
                    return isLateCancel ? (
                      // UI for late cancellation (penalty applies by default)
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            type="button" 
                            variant="destructive" 
                            className="mb-2 sm:mb-0"
                            disabled={sessionData.status !== 'scheduled'}
                          >
                            Cancel Session
                          </Button>
                        </AlertDialogTrigger>
                         <AlertDialogContent>
                           <AlertDialogHeader>
                             <AlertDialogTitle>Penalty Cancellation</AlertDialogTitle>
                             <AlertDialogDescription>
                               This session is within the 24-hour cancellation window. Cancelling it will result in a penalty, and the session will not be credited back.
                             </AlertDialogDescription>
                           </AlertDialogHeader>
                           <div className="flex items-center space-x-2 p-4 border rounded-md my-4">
                             <Checkbox
                               id="waive-penalty"
                               checked={isPenaltyWaived}
                               onCheckedChange={(checked) => setIsPenaltyWaived(Boolean(checked))}
                             />
                             <Label htmlFor="waive-penalty">Waive penalty</Label>
                           </div>
                           <AlertDialogFooter>
                             <AlertDialogCancel onClick={() => setIsPenaltyWaived(false)}>Keep Session</AlertDialogCancel>
                             <AlertDialogAction onClick={() => handleCancellation(!isPenaltyWaived)}>
                               Confirm Cancellation
                             </AlertDialogAction>
                           </AlertDialogFooter>
                         </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      // UI for on-time cancellation (no penalty)
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            type="button" 
                            variant="destructive" 
                            className="mb-2 sm:mb-0"
                            disabled={sessionData.status !== 'scheduled'}
                          >
                            Cancel Session
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Cancellation</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to cancel this session? A session credit will be added back to the client's pack or subscription.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Session</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleCancellation(false)}>
                              Confirm Cancellation
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    );
                  })()}

                  <Button type="button" onClick={onClose} className="mb-2 sm:mb-0">Close</Button>
                </>
              )}
            </DialogFooter>
          </form>
        </Form>

        {/* NEW: Render ConfirmAvailabilityOverrideModal */}
        {showAvailabilityOverrideConfirm && (
          <ConfirmAvailabilityOverrideModal
            isOpen={showAvailabilityOverrideConfirm}
            onClose={() => {
              setShowAvailabilityOverrideConfirm(false);
              setPendingSubmitData(null); // Clear pending data if user cancels
            }}
            onConfirm={handleConfirmAvailabilityOverride}
            proposedDateTime={parse(form.watch('session_time'), 'HH:mm', form.watch('session_date') || new Date())}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}