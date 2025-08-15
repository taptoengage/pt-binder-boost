import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { format, differenceInHours, isBefore, parse, addMinutes, isWithinInterval, setHours, setMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Phone, Mail, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useSessionOverlapCheck, validateOverlap } from '@/hooks/useSessionOverlapCheck';
import ConfirmAvailabilityOverrideModal from '@/components/ConfirmAvailabilityOverrideModal';
import { validatePackAvailability } from '@/lib/packValidation';
import { generateTimeOptions } from '@/lib/availabilityUtils';

const timeOptions = generateTimeOptions();

// Define Zod Schema for editing a session
const EditSessionSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'cancelled_late', 'cancelled_early']),
  session_date: z.date(),
  session_time: z.string().min(1, 'Session time is required.'),
});

type EditSessionFormData = z.infer<typeof EditSessionSchema>;

interface UniversalSessionModalProps {
  mode: 'view' | 'edit' | 'book';
  isOpen: boolean;
  onClose: () => void;
  session?: any; // For view/edit modes
  selectedSlot?: { start: Date; end: Date }; // For book mode
  clientId?: string; // For book mode
  trainerId?: string; // For book mode
  onSessionUpdated?: () => void; // Callback for data refresh
}

// Define interfaces for booking data
interface SessionPack {
  id: string;
  total_sessions: number;
  sessions_remaining: number;
  service_types: { name: string } | null;
  service_type_id: string;
}

interface ClientSubscription {
  id: string;
  billing_cycle: string;
  payment_frequency: string;
  billing_amount: number;
  status: string;
}

interface ServiceType {
  id: string;
  name: string;
}

export default function UniversalSessionModal({ 
  mode, 
  isOpen, 
  onClose, 
  session, 
  selectedSlot, 
  clientId, 
  trainerId, 
  onSessionUpdated 
}: UniversalSessionModalProps) {
  // Remove isEditing state - view mode is now purely read-only
  const [isPenaltyWaived, setIsPenaltyWaived] = useState(false);
  // NEW STATE for availability override modal
  const [showAvailabilityOverrideConfirm, setShowAvailabilityOverrideConfirm] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<EditSessionFormData | null>(null);
  
  // Book mode state
  const [isBooking, setIsBooking] = useState(false);
  const [selectedBookingOption, setSelectedBookingOption] = useState<string | null>(null);
  const [activeSessionPacks, setActiveSessionPacks] = useState<SessionPack[]>([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState<ClientSubscription[]>([]);
  const [availableServices, setAvailableServices] = useState<ServiceType[]>([]);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<string | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [isLoadingBookingData, setIsLoadingBookingData] = useState(false);
  
  const { toast } = useToast();
  const { user, trainer, client } = useAuth();
  const queryClient = useQueryClient();
  
  // Determine user role
  const isTrainer = !!trainer;
  const isClient = !!client;
  
  
  const DEFAULT_SESSION_DURATION_MINUTES = 60;

  // Helper to generate 30-minute time slots within an availability block
  const generateBookableTimeSlots = useCallback((start: Date, end: Date) => {
    const slots = [];
    let currentTime = start;
    while (isBefore(currentTime, end)) {
      slots.push(currentTime);
      currentTime = addMinutes(currentTime, 30);
    }
    return slots;
  }, []);

  const bookableTimeSlots = useMemo(() => {
    if (!selectedSlot) return [];
    return generateBookableTimeSlots(selectedSlot.start, selectedSlot.end);
  }, [selectedSlot, generateBookableTimeSlots]);

  // Fetch complete session data with joins (for view/edit modes)
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
    enabled: isOpen && !!session?.id && (mode === 'view' || mode === 'edit'),
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
    enabled: !!user?.id && mode === 'edit', // Only enable if in edit mode
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
    enabled: !!user?.id && mode === 'edit', // Only enable if in edit mode
    staleTime: 60 * 1000,
  });

  // Use the reusable overlap check hook
  const { isLoadingOverlaps, overlappingSessionsCount } = useSessionOverlapCheck({
    trainerId: user?.id,
    proposedDate: watchedSessionDate,
    proposedTime: watchedSessionTime,
    proposedStatus: watchedSessionStatus,
    sessionIdToExclude: sessionData?.id, // Pass current session ID to exclude!
    enabled: mode === 'edit', // Only enable this hook when in edit mode
  });

  // Reset form when modal opens or session data changes to ensure correct default values
  useEffect(() => {
    if (isOpen && sessionData && (mode === 'view' || mode === 'edit')) {
      form.reset({
        status: sessionData.status || 'scheduled',
        session_date: sessionData.session_date ? new Date(sessionData.session_date) : new Date(),
        session_time: sessionData.session_date ? format(new Date(sessionData.session_date), 'HH:mm') : '09:00',
      });
      // No longer need to set isEditing - view mode is read-only
    }
  }, [isOpen, sessionData, form, mode]);

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

  // Book mode data fetching
  useEffect(() => {
    if (!isOpen || mode !== 'book' || !clientId || !trainerId) return;

    const fetchClientEligibilityData = async () => {
      setIsLoadingBookingData(true);
      try {
        // Fetch active session packs for the client
        const { data: packs, error: packsError } = await supabase
          .from('session_packs')
          .select('id, total_sessions, sessions_remaining, status, service_type_id, service_types(name)')
          .eq('client_id', clientId)
          .eq('trainer_id', trainerId)
          .eq('status', 'active');

        if (packsError) throw packsError;
        
        // Calculate actual remaining sessions by subtracting scheduled sessions
        const packsWithActualRemaining = await Promise.all(
          (packs || []).map(async (pack) => {
            const { data: sessionCounts } = await supabase
              .from('sessions')
              .select('status, cancellation_reason')
              .eq('session_pack_id', pack.id);
            
            // Count sessions that consume pack credits (scheduled + consumed)
            const usedSessions = sessionCounts?.filter(s => 
              s.status === 'scheduled' ||
              s.status === 'completed' || 
              s.status === 'no-show' ||
              (s.status === 'cancelled' && s.cancellation_reason === 'penalty')
            ).length || 0;
            const actualRemaining = Math.max(0, pack.total_sessions - usedSessions);
            
            return {
              ...pack,
              sessions_remaining: actualRemaining
            };
          })
        );
        
        // Only show packs with remaining sessions
        const availablePacks = packsWithActualRemaining.filter(pack => pack.sessions_remaining > 0);
        setActiveSessionPacks(availablePacks);

        // Fetch active subscriptions for the client
        const { data: subscriptions, error: subscriptionsError } = await supabase
          .from('client_subscriptions')
          .select('id, billing_cycle, payment_frequency, billing_amount, status')
          .eq('client_id', clientId)
          .eq('trainer_id', trainerId)
          .eq('status', 'active');

        if (subscriptionsError) throw subscriptionsError;
        setActiveSubscriptions(subscriptions || []);

        // Fetch all service types created by this trainer
        const { data: services, error: servicesError } = await supabase
          .from('service_types')
          .select('id, name')
          .eq('trainer_id', trainerId);

        if (servicesError) throw servicesError;
        setAvailableServices(services || []);

      } catch (error: any) {
        console.error('Error fetching client eligibility data:', error.message);
        toast({
          title: "Error",
          description: "Failed to load booking eligibility data.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingBookingData(false);
      }
    };

    fetchClientEligibilityData();
  }, [isOpen, mode, clientId, trainerId, toast]);

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
        .eq('id', sessionData?.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Session updated successfully!',
      });
      
      // Successfully updated session
      onClose(); // Close the modal
      onSessionUpdated?.(); // Call the callback if provided
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

    if (!sessionData?.session_date) {
      toast({ title: 'Error', description: 'Session date is missing.', variant: 'destructive' });
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
      onSessionUpdated?.(); // Call the callback if provided
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

  // Book mode booking handler
  const handleConfirmBooking = async () => {
    if (!selectedSlot || !selectedStartTime || !selectedServiceTypeId || !selectedBookingOption) {
      toast({
        title: "Error",
        description: "Please select all required options.",
        variant: "destructive",
      });
      return;
    }

    // Parse the single selectedBookingOption string
    const [method, id] = selectedBookingOption.split(':');

    // Universal over-scheduling validation for pack bookings
    if (method === 'pack') {
      const selectedPack = activeSessionPacks.find(pack => pack.id === id);
      const totalSessionsInPack = selectedPack?.total_sessions || 0;

      const validation = await validatePackAvailability(id, totalSessionsInPack);
      
      if (!validation.isValid) {
        toast({
          title: "Cannot Book Session",
          description: validation.errorMessage,
          variant: "destructive",
        });
        return;
      }
    }

    setIsBooking(true);
    try {
      // Get the final session date with the selected start time
      const [hour, minute] = selectedStartTime.split(':').map(Number);
      const sessionDateWithTime = setMinutes(setHours(selectedSlot.start, hour), minute);

      const bookingData = {
        action: 'book',
        clientId,
        trainerId,
        sessionDate: sessionDateWithTime.toISOString(),
        serviceTypeId: selectedServiceTypeId,
        bookingMethod: method,
        sourcePackId: method === 'pack' ? id : null,
        sourceSubscriptionId: method === 'subscription' ? id : null,
      };

      // Get the current session to pass the JWT token
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('manage-session', {
        body: bookingData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) {
        console.error('FunctionsHttpError details:', error);
        
        let errorMessage = "Failed to book session. Please try again.";
        
        if (error.name === 'FunctionsHttpError') {
          try {
            if (data && data.error) {
              errorMessage = data.error;
            } else if (error.context?.body) {
              const bodyData = typeof error.context.body === 'string' 
                ? JSON.parse(error.context.body) 
                : error.context.body;
              
              if (bodyData.error) {
                errorMessage = bodyData.error;
              }
            }
          } catch (parseError) {
            console.error('Failed to parse error response:', parseError);
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        throw new Error(errorMessage);
      }

      // Handle successful response
      if (data?.success) {
        toast({
          title: "Success",
          description: data.message || "Session booked successfully!",
        });
        onClose();
        onSessionUpdated?.();
      } else if (data?.error) {
        throw new Error(data.error);
      } else {
        throw new Error('Booking failed - unexpected response format');
      }
    } catch (error: any) {
      console.error('Booking failed:', error);
      
      toast({
        title: "Booking Failed",
        description: error.message || "Failed to book session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsBooking(false);
    }
  };

  if (!isOpen) return null; // Don't render if not open

  // Add robust guard clauses to prevent crashes
  if (mode !== 'book' && !session) {
    console.error('UniversalSessionModal: Missing session prop for view/edit mode.');
    return null;
  }

  if (mode === 'book' && !selectedSlot) {
    console.error('UniversalSessionModal: Missing selectedSlot prop for book mode.');
    return null;
  }

  // Calculate if cancellation is late (within 24 hours)
  const isLateCancel = useMemo(() => {
    if (!sessionData?.session_date) return false;
    const sessionDateTime = new Date(sessionData.session_date);
    const now = new Date();
    const hoursUntilSession = differenceInHours(sessionDateTime, now);
    return hoursUntilSession <= 24;
  }, [sessionData?.session_date]);

  // MODE: VIEW - Session viewing functionality
  if (mode === 'view') {
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
              Information about this scheduled session.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <p><strong>Session ID:</strong> {sessionData?.id || 'N/A'}</p>
            {sessionData?.session_pack_id && (
              <p><strong>Pack ID:</strong> {sessionData.session_pack_id}</p>
            )}
            {sessionData?.subscription_id && (
              <p><strong>Subscription ID:</strong> {sessionData.subscription_id}</p>
            )}
            <p><strong>Client:</strong> {sessionData?.clients?.name || 'N/A'}</p>

            {/* Contact Buttons - Only show for trainers */}
            {isTrainer && sessionData?.clients && (
              <div className="flex space-x-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={!sessionData?.clients?.phone_number}
                >
                  <a href={`tel:${sessionData.clients.phone_number}`}>
                    <Phone className="w-4 h-4 mr-2" /> Call Client
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={!sessionData?.clients?.email}
                >
                  <a href={`mailto:${sessionData.clients.email}`}>
                    <Mail className="w-4 h-4 mr-2" /> Email Client
                  </a>
                </Button>
              </div>
            )}

            <p><strong>Service:</strong> {sessionData?.service_types?.name || 'N/A'}</p>

            {/* Status Field - Read Only */}
            <div>
              <Label>Status</Label>
              <div className="text-sm font-medium mt-1">
                 <Badge className={cn(
                  { 'bg-green-500': sessionData?.status === 'scheduled' },
                  { 'bg-gray-500': sessionData?.status === 'completed' },
                  { 'bg-red-500': sessionData?.status === 'cancelled' || sessionData?.status === 'cancelled_late' },
                  { 'bg-orange-500': sessionData?.status === 'cancelled_early' }
                )}>
                  {sessionData?.status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'}
                </Badge>
              </div>
            </div>

            {/* Session Date Field - Read Only */}
            <div>
              <Label>Session Date</Label>
              <div className="text-sm font-medium mt-1">
                {sessionData?.session_date ? format(new Date(sessionData.session_date), 'PPP') : 'N/A'}
              </div>
            </div>

            {/* Session Time Field - Read Only */}
            <div>
              <Label>Session Time</Label>
              <div className="text-sm font-medium mt-1">
                {sessionData?.session_date ? format(new Date(sessionData.session_date), 'p') : 'N/A'}
              </div>
            </div>

            {sessionData?.notes && (
              <div>
                <Label>Notes</Label>
                <div className="text-sm font-medium mt-1">{sessionData.notes}</div>
              </div>
            )}

            {/* Late cancellation warning for clients */}
            {isClient && isLateCancel && sessionData?.status === 'scheduled' && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Cancelling within 24 hours may result in a penalty charge.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-2 mt-6">
            <div className="flex gap-2 mb-2 sm:mb-0">
              <Button type="button" onClick={onClose}>Close</Button>
              
              {/* Role-based action buttons */}
              {isTrainer && sessionData?.status === 'scheduled' && (
                <>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      // Switch to edit mode - this would need to be handled by parent component
                      onClose();
                      // Parent component should handle opening in edit mode
                    }}
                  >
                    Edit Session
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        Cancel Session
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Session</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to cancel this session? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Session</AlertDialogCancel>
                         <AlertDialogAction onClick={() => handleCancellation(false)}>
                           Cancel Session
                         </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}

              {isClient && sessionData?.status === 'scheduled' && (
                <>
                  {/* Edit Session button - only if not late cancellation */}
                  {!isLateCancel && (
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => {
                        // Switch to edit mode - this would need to be handled by parent component
                        onClose();
                        // Parent component should handle opening in edit mode
                      }}
                    >
                      Edit Session
                    </Button>
                  )}
                  
                  {/* Cancel Session button with conditional logic */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        Cancel Session
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Session</AlertDialogTitle>
                        <AlertDialogDescription>
                          {isLateCancel ? 
                            "Cancelling within 24 hours may result in a penalty charge. Are you sure you want to proceed?" :
                            "Are you sure you want to cancel this session?"
                          }
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      {isLateCancel && (
                        <div className="px-6 pb-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox 
                              id="waive-penalty" 
                              checked={isPenaltyWaived}
                              onCheckedChange={(checked) => setIsPenaltyWaived(checked === true)}
                            />
                            <Label htmlFor="waive-penalty" className="text-sm">
                              I understand this may incur a penalty charge
                            </Label>
                          </div>
                        </div>
                      )}
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Session</AlertDialogCancel>
                         <AlertDialogAction 
                           onClick={() => handleCancellation(isLateCancel && !isPenaltyWaived)}
                           disabled={isLateCancel && !isPenaltyWaived}
                         >
                           Cancel Session
                         </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // MODE: EDIT - Session editing functionality (only accessible to trainers)
  if (mode === 'edit') {
    // Restrict edit mode to trainers only
    if (!isTrainer) {
      return (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-[425px] md:max-w-md">
            <DialogHeader>
              <DialogTitle>Access Denied</DialogTitle>
              <DialogDescription>Only trainers can edit sessions.</DialogDescription>
            </DialogHeader>
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">You do not have permission to edit sessions.</p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    // Show loading state while fetching session data
    if (isLoadingSession) {
      return (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-[425px] md:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Session</DialogTitle>
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
            <DialogTitle>Edit Session</DialogTitle>
            <DialogDescription>
              Edit this session's details.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="py-4 space-y-4">
              <p><strong>Session ID:</strong> {sessionData?.id || 'N/A'}</p>
              {sessionData?.session_pack_id && (
                <p><strong>Pack ID:</strong> {sessionData.session_pack_id}</p>
              )}
              {sessionData?.subscription_id && (
                <p><strong>Subscription ID:</strong> {sessionData.subscription_id}</p>
              )}
              <p><strong>Client:</strong> {sessionData?.clients?.name || 'N/A'}</p>
              <p><strong>Service:</strong> {sessionData?.service_types?.name || 'N/A'}</p>

              {/* Status Field */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {sessionData?.notes && (
                <p><strong>Notes:</strong> {sessionData.notes}</p>
              )}

              <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-2 mt-6">
                <Button type="button" variant="outline" onClick={onClose} className="mb-2 sm:mb-0">
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isValid || isLoadingOverlaps} className="mb-2 sm:mb-0">
                  {form.formState.isSubmitting ? "Saving..." :
                   isLoadingOverlaps ? "Checking Overlaps..." :
                   "Save Changes"}
                </Button>
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

  // MODE: BOOK - Session booking functionality (primarily for clients)
  if (mode === 'book') {
    // Restrict book mode to clients (trainers can still book for clients if needed)
    if (!isClient && !isTrainer) {
      return (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-[425px] md:max-w-md">
            <DialogHeader>
              <DialogTitle>Access Denied</DialogTitle>
              <DialogDescription>You need to be logged in to book sessions.</DialogDescription>
            </DialogHeader>
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">Please log in to book a session.</p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Book Session</DialogTitle>
            <DialogDescription>
              Confirm your session details and select a booking method.
            </DialogDescription>
          </DialogHeader>
          {isLoadingBookingData ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              {selectedSlot && (
                <p className="text-sm font-medium">
                  Session Date: {format(selectedSlot.start, 'MMM dd, yyyy')}
                </p>
              )}

              {/* Time Slot Selection using a dropdown */}
              <div className="space-y-2">
                <Label htmlFor="startTime">Choose a Start Time</Label>
                <Select
                  value={selectedStartTime || ''}
                  onValueChange={setSelectedStartTime}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a start time" />
                  </SelectTrigger>
                  <SelectContent>
                    {bookableTimeSlots.map((time, index) => (
                      <SelectItem key={index} value={format(time, 'HH:mm')}>
                        {format(time, 'h:mm a')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Service Type</Label>
                <RadioGroup
                  value={selectedServiceTypeId || ''}
                  onValueChange={setSelectedServiceTypeId}
                  className="flex flex-col space-y-1"
                >
                  {availableServices.length > 0 ? (
                    availableServices.map(service => (
                      <div key={service.id} className="flex items-center space-x-2">
                        <RadioGroupItem value={service.id} id={`service-${service.id}`} />
                        <Label htmlFor={`service-${service.id}`}>{service.name}</Label>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">No service types available for your trainer.</p>
                  )}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>How would you like to book?</Label>
                <RadioGroup
                  value={selectedBookingOption || ''}
                  onValueChange={setSelectedBookingOption}
                  className="flex flex-col space-y-3"
                >
                  {/* Session Packs */}
                  {activeSessionPacks.map(pack => (
                    <div key={pack.id} className="flex items-center space-x-2">
                      <RadioGroupItem value={`pack:${pack.id}`} id={`pack-${pack.id}`} />
                      <Label htmlFor={`pack-${pack.id}`} className="cursor-pointer">
                        <span className="font-medium">Session Pack:</span> {pack.service_types?.name} ({pack.sessions_remaining} remaining)
                      </Label>
                    </div>
                  ))}

                  {/* Subscriptions */}
                  {activeSubscriptions.map(sub => (
                    <div key={sub.id} className="flex items-center space-x-2">
                      <RadioGroupItem value={`subscription:${sub.id}`} id={`subscription-${sub.id}`} />
                      <Label htmlFor={`subscription-${sub.id}`} className="cursor-pointer">
                        <span className="font-medium">Subscription:</span> {sub.billing_cycle} ({sub.payment_frequency})
                      </Label>
                    </div>
                  ))}

                  {/* One-off option */}
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="one-off" id="one-off" />
                    <Label htmlFor="one-off" className="cursor-pointer">
                      <span className="font-medium">One-off Session</span> (Trainer approval required)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isLoadingBookingData || isBooking}>Cancel</Button>
            <Button 
              type="submit" 
              onClick={handleConfirmBooking} 
              disabled={isLoadingBookingData || isBooking || !selectedSlot || !selectedStartTime || !selectedServiceTypeId || !selectedBookingOption}
            >
              {isBooking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isBooking ? 'Booking...' : 'Confirm Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}