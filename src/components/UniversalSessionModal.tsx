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
  session?: any; 
  selectedSlot?: { start: Date; end: Date };
  clientId?: string;
  trainerId?: string;
  onSessionUpdated?: () => void;
}

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
  const { toast } = useToast();
  const { user, trainer, client, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const isTrainer = !!trainer;
  const isClient = !!client;

  const [currentMode, setCurrentMode] = useState<'view' | 'edit' | 'book'>(mode);
  const [isPenaltyWaived, setIsPenaltyWaived] = useState(false);
  const [showAvailabilityOverrideConfirm, setShowAvailabilityOverrideConfirm] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<EditSessionFormData | null>(null);
  
  const [isBooking, setIsBooking] = useState(false);
  const [selectedBookingOption, setSelectedBookingOption] = useState<string | null>(null);
  const [activeSessionPacks, setActiveSessionPacks] = useState<SessionPack[]>([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState<ClientSubscription[]>([]);
  const [availableServices, setAvailableServices] = useState<ServiceType[]>([]);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<string | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [isLoadingBookingData, setIsLoadingBookingData] = useState(false);
  
  const [internalSlot, setInternalSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const DEFAULT_SESSION_DURATION_MINUTES = 60;

  const form = useForm<EditSessionFormData>({
    resolver: zodResolver(EditSessionSchema),
    defaultValues: {
      status: 'scheduled',
      session_date: new Date(),
      session_time: '09:00',
    },
    mode: 'onChange'
  });

  const watchedSessionDate = form.watch('session_date');
  const watchedSessionTime = form.watch('session_time');
  const watchedSessionStatus = form.watch('status');

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
    const slot = selectedSlot || internalSlot;
    if (!slot) return [];
    return generateBookableTimeSlots(slot.start, slot.end);
  }, [selectedSlot, internalSlot, generateBookableTimeSlots]);

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
    enabled: isOpen && !!session?.id && (currentMode === 'view' || currentMode === 'edit') && !authLoading,
    staleTime: 30 * 1000,
  });

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
    enabled: !!user?.id && currentMode === 'edit' && !authLoading,
    staleTime: 60 * 1000,
  });

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
    enabled: !!user?.id && currentMode === 'edit' && !authLoading,
    staleTime: 60 * 1000,
  });

  const { isLoadingOverlaps, overlappingSessionsCount } = useSessionOverlapCheck({
    trainerId: user?.id,
    proposedDate: watchedSessionDate,
    proposedTime: watchedSessionTime,
    proposedStatus: watchedSessionStatus,
    sessionIdToExclude: fullSessionData?.id,
    enabled: currentMode === 'edit' && !authLoading,
  });

  const sessionData = fullSessionData || session;

  useEffect(() => {
    setCurrentMode(mode);
  }, [mode, isOpen]);

  useEffect(() => {
    if (isOpen && sessionData && (currentMode === 'view' || currentMode === 'edit')) {
      form.reset({
        status: sessionData?.status || 'scheduled',
        session_date: sessionData?.session_date ? new Date(sessionData.session_date) : new Date(),
        session_time: sessionData?.session_date ? format(new Date(sessionData.session_date), 'HH:mm') : '09:00',
      });
    }
  }, [isOpen, sessionData, form, currentMode]);

  useEffect(() => {
    if (overlappingSessionsCount !== undefined && !isLoadingOverlaps && watchedSessionStatus === 'scheduled') {
        if (overlappingSessionsCount > 0) {
          form.setError('session_time', {
            type: 'custom',
            message: 'This time slot overlaps with another scheduled session.',
          });
        } else {
          form.clearErrors('session_time');
        }
    } else if (watchedSessionStatus !== 'scheduled' && !isLoadingOverlaps) {
        form.clearErrors('session_time');
    }
  }, [overlappingSessionsCount, isLoadingOverlaps, watchedSessionStatus, form]);

  useEffect(() => {
    if (!isOpen || currentMode !== 'book' || !clientId || !trainerId) return;

    const fetchClientEligibilityData = async () => {
      setIsLoadingBookingData(true);
      try {
        const { data: packs, error: packsError } = await supabase
          .from('session_packs')
          .select('id, total_sessions, sessions_remaining, status, service_type_id, service_types(name)')
          .eq('client_id', clientId)
          .eq('trainer_id', trainerId)
          .eq('status', 'active');

        if (packsError) throw packsError;
        
        const packsWithActualRemaining = await Promise.all(
          (packs || []).map(async (pack) => {
            const { data: sessionCounts } = await supabase
              .from('sessions')
              .select('status, cancellation_reason')
              .eq('session_pack_id', pack.id);
            
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
        
        const availablePacks = packsWithActualRemaining.filter(pack => pack.sessions_remaining > 0);
        setActiveSessionPacks(availablePacks);

        const { data: subscriptions, error: subscriptionsError } = await supabase
          .from('client_subscriptions')
          .select('id, billing_cycle, payment_frequency, billing_amount, status')
          .eq('client_id', clientId)
          .eq('trainer_id', trainerId)
          .eq('status', 'active');

        if (subscriptionsError) throw subscriptionsError;
        setActiveSubscriptions(subscriptions || []);

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
  }, [isOpen, currentMode, clientId, trainerId, toast]);

  const finalAvailabilityRangesForProposedDate = useMemo(() => {
    const ranges: Array<{ start: Date; end: Date }> = [];
    const proposedDate = form.watch('session_date');
    if (!proposedDate) return ranges;

    const dayKey = format(proposedDate, 'yyyy-MM-dd');
    const dayOfWeekLowercase = format(proposedDate, 'EEEE').toLowerCase();

    let currentDayRanges: Array<{ start: Date; end: Date }> = [];
    (recurringTemplates || []).forEach(template => {
        if (template.day_of_week === dayOfWeekLowercase) {
            const start = parse(template.start_time, 'HH:mm', proposedDate);
            const end = parse(template.end_time, 'HH:mm', proposedDate);
            currentDayRanges.push({ start, end });
        }
    });

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
    let effectiveAvailableRanges = mergedRecurringRanges;

    const exceptionsForProposedDate = (exceptions || []).filter(
        ex => format(new Date(ex.exception_date), 'yyyy-MM-dd') === dayKey
    );

    exceptionsForProposedDate.forEach(exception => {
        const exceptionDateRef = new Date(exception.exception_date);

        if (exception.exception_type === 'unavailable_full_day') {
            effectiveAvailableRanges = [];
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
        } else if (exception.exception_type === 'available') {
            const availableStart = parse(exception.start_time || '00:00', 'HH:mm', exceptionDateRef);
            const availableEnd = parse(exception.end_time || '23:59', 'HH:mm', exceptionDateRef);
            effectiveAvailableRanges.push({ start: availableStart, end: availableEnd });
        }
    });

    effectiveAvailableRanges.sort((a,b) => a.start.getTime() - b.start.getTime());

    return effectiveAvailableRanges;
  }, [form, recurringTemplates, exceptions]);

  const validateSessionAgainstAvailability = useCallback((proposedDate: Date, proposedTime: string): boolean => {
    if (!proposedDate || !proposedTime) return false;

    const proposedStartTime = parse(proposedTime, 'HH:mm', proposedDate);
    const proposedEndTime = addMinutes(proposedStartTime, DEFAULT_SESSION_DURATION_MINUTES);

    return finalAvailabilityRangesForProposedDate.some(range => {
        return proposedStartTime >= range.start && proposedEndTime <= range.end;
    });
  }, [finalAvailabilityRangesForProposedDate]);

  const isOutsideAvailability = useMemo(() => {
    const proposedDate = form.watch('session_date');
    const proposedTime = form.watch('session_time');
    const proposedStatus = form.watch('status');

    if (!proposedDate || !proposedTime || proposedStatus !== 'scheduled') {
        return false;
    }
    const proposedSessionStart = parse(proposedTime, 'HH:mm', proposedDate);
    const proposedSessionEnd = addMinutes(proposedSessionStart, DEFAULT_SESSION_DURATION_MINUTES);

    const fallsWithinAvailableBlock = finalAvailabilityRangesForProposedDate.some(block =>
      proposedSessionStart >= block.start && proposedSessionEnd <= block.end
    );

    return !fallsWithinAvailableBlock;
  }, [form.watch('session_date'), form.watch('session_time'), form.watch('status'), finalAvailabilityRangesForProposedDate]);

  const isLateCancel = useMemo(() => {
    if (!sessionData?.session_date) return false;
    try {
      const sessionDateTime = new Date(sessionData.session_date);
      const now = new Date();
      const hoursUntilSession = differenceInHours(sessionDateTime, now);
      return hoursUntilSession <= 24;
    } catch (error) {
      console.error('Error calculating late cancellation:', error);
      return false;
    }
  }, [sessionData?.session_date]);

  const handleModalClose = () => {
    setCurrentMode(mode);
    onClose();
  };

  if (!isOpen) return null;

  if (authLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Loading...</DialogTitle>
            <DialogDescription>
              Authenticating user...
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!user) {
    return (
      <Dialog open={isOpen} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
            <DialogDescription>
              You must be logged in to access this feature.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (mode !== 'book' && !session) {
    console.error('UniversalSessionModal: Missing session prop for view/edit mode.');
    return null;
  }

  console.log('[UniversalSessionModal] booking source', { 
    slotSource: selectedSlot ? 'external' : 'internal',
    mode,
    hasSelectedSlot: !!selectedSlot,
    hasInternalSlot: !!internalSlot 
  });

  const proceedWithSave = async (data: EditSessionFormData) => {
    try {
      const [hours, minutes] = data.session_time.split(':').map(Number);
      const sessionDateTime = new Date(data.session_date);
      sessionDateTime.setHours(hours, minutes, 0, 0);

      const payload = {
        status: data.status,
        session_date: sessionDateTime.toISOString(),
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
      
      setCurrentMode('view');
      onSessionUpdated?.();
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

  const onSubmit = async (data: EditSessionFormData) => {
    const isValid = await form.trigger();
    if (!isValid || isLoadingOverlaps) {
      toast({ title: 'Validation Error', description: 'Please correct the errors before saving.', variant: 'destructive' });
      return;
    }

    if (form.watch('status') === 'scheduled' && isOutsideAvailability) {
      setPendingSubmitData(data);
      setShowAvailabilityOverrideConfirm(true);
      return;
    }

    await proceedWithSave(data);
  };

  const handleConfirmAvailabilityOverride = async () => {
    setShowAvailabilityOverrideConfirm(false);
    if (pendingSubmitData) {
      await proceedWithSave(pendingSubmitData);
      setPendingSubmitData(null);
    } else {
      toast({ title: 'Error', description: 'No session data to confirm.', variant: 'destructive' });
      onClose();
    }
  };

  const handleCompleteSession = async () => {
    if (!sessionData?.id) {
      console.error('No session ID available');
      return;
    }

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('manage-session', {
        body: {
          action: 'complete',
          sessionId: sessionData.id,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) {
        console.error('Error completing session:', error);
        let errorMessage = "Failed to complete session. Please try again.";
        
        if (data && data.error) {
          errorMessage = data.error;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        throw new Error(errorMessage);
      }

      if (data?.success) {
        toast({
          title: "Success",
          description: "Session marked as completed successfully!",
        });
        onClose();
        onSessionUpdated?.();
      } else {
        throw new Error(data?.error || 'Failed to complete session');
      }
    } catch (error: any) {
      console.error('Failed to complete session:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to complete session. Please try again.",
        variant: "destructive",
      });
    }
  };

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

    const finalPenalize = isLateCancel && penalize;

    try {
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

      onClose();
      onSessionUpdated?.();
      queryClient.invalidateQueries({ queryKey: ['trainerSessions', user.id] });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: `Failed to cancel session: ${error.message}`,
        variant: 'destructive',
      });
      console.error("Error cancelling session:", error);
    }
  };

  const handleConfirmBooking = async () => {
    const slot = selectedSlot || internalSlot;
    if (!slot || !selectedStartTime || !selectedServiceTypeId || !selectedBookingOption) {
      toast({
        title: "Error",
        description: "Please select all required options.",
        variant: "destructive",
      });
      return;
    }

    const raw = selectedBookingOption;
    const [rawMethod, rawId] = raw.includes(':') ? raw.split(':') : [raw, null];
    const method = rawMethod === 'one-off' ? 'direct' : rawMethod;
    const id = rawId ?? null;

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
      const [hour, minute] = selectedStartTime.split(':').map(Number);
      const sessionDateWithTime = setMinutes(setHours(slot.start, hour), minute);

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

  if (currentMode === 'view') {
    if (isLoadingSession) {
      return (
        <Dialog open={isOpen} onOpenChange={handleModalClose}>
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

    if (sessionError) {
      return (
        <Dialog open={isOpen} onOpenChange={handleModalClose}>
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
      <Dialog open={isOpen} onOpenChange={handleModalClose}>
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

            {isTrainer && sessionData?.clients && (
              <div className="flex space-x-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={!sessionData?.clients?.phone_number}
                >
                  <a href={`tel:${sessionData?.clients?.phone_number || ''}`}>
                    <Phone className="w-4 h-4 mr-2" /> Call Client
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={!sessionData?.clients?.email}
                >
                  <a href={`mailto:${sessionData?.clients?.email || ''}`}>
                    <Mail className="w-4 h-4 mr-2" /> Email Client
                  </a>
                </Button>
              </div>
            )}

            <p><strong>Service:</strong> {sessionData?.service_types?.name || 'N/A'}</p>

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

            <div>
              <Label>Session Date</Label>
              <div className="text-sm font-medium mt-1">
                {(() => {
                  try {
                    return sessionData?.session_date ? format(new Date(sessionData.session_date), 'EEEE, PPP') : 'N/A';
                  } catch (error) {
                    console.error('Error formatting session date:', error);
                    return 'Invalid Date';
                  }
                })()}
              </div>
            </div>

            <div>
              <Label>Session Time</Label>
              <div className="text-sm font-medium mt-1">
                {(() => {
                  try {
                    return sessionData?.session_date ? format(new Date(sessionData.session_date), 'p') : 'N/A';
                  } catch (error) {
                    console.error('Error formatting session time:', error);
                    return 'Invalid Time';
                  }
                })()}
              </div>
            </div>

            {sessionData?.notes && (
              <div>
                <Label>Notes</Label>
                <div className="text-sm font-medium mt-1">{sessionData.notes}</div>
              </div>
            )}

            {isClient && isLateCancel && sessionData?.status === 'scheduled' && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Cancelling within 24 hours may result in a penalty charge.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:space-x-2">
              {isTrainer && sessionData?.status === 'scheduled' && sessionData?.id && (
                <Button 
                  type="button" 
                  variant="success"
                  className="mb-2 sm:mb-0"
                  onClick={handleCompleteSession}
                >
                  Mark as Complete
                </Button>
              )}
              
              <div className="flex gap-2">
              <Button type="button" onClick={handleModalClose}>Close</Button>
              
              {isTrainer && sessionData?.status === 'scheduled' && sessionData?.id && (
                <>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setCurrentMode('edit');
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

              {isClient && sessionData?.status === 'scheduled' && sessionData?.id && (
                <>
                  {!isLateCancel && (
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => {
                        onClose();
                      }}
                    >
                      Edit Session
                    </Button>
                  )}
                  
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
            </div>
           </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (currentMode === 'edit') {
    if (!isTrainer || !trainer?.id) {
      return (
        <Dialog open={isOpen} onOpenChange={handleModalClose}>
          <DialogContent className="sm:max-w-[425px] md:max-w-md">
            <DialogHeader>
              <DialogTitle>Access Denied</DialogTitle>
              <DialogDescription>Only authenticated trainers can edit sessions.</DialogDescription>
            </DialogHeader>
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">
                {!trainer ? 'You must be logged in as a trainer to edit sessions.' : 'Invalid trainer authentication.'}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    if (isLoadingSession) {
      return (
        <Dialog open={isOpen} onOpenChange={handleModalClose}>
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

    if (sessionError) {
      return (
        <Dialog open={isOpen} onOpenChange={handleModalClose}>
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
      <Dialog open={isOpen} onOpenChange={handleModalClose}>
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
                              format(field.value, "EEEE, PPP")
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

          {showAvailabilityOverrideConfirm && (
            <ConfirmAvailabilityOverrideModal
              isOpen={showAvailabilityOverrideConfirm}
              onClose={() => {
                setShowAvailabilityOverrideConfirm(false);
                setPendingSubmitData(null);
              }}
              onConfirm={handleConfirmAvailabilityOverride}
              proposedDateTime={parse(form.watch('session_time'), 'HH:mm', form.watch('session_date') || new Date())}
            />
          )}
        </DialogContent>
      </Dialog>
    );
  }

  if (currentMode === 'book') {
    if (!isClient && !isTrainer) {
      return (
        <Dialog open={isOpen} onOpenChange={handleModalClose}>
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
      <Dialog open={isOpen} onOpenChange={handleModalClose}>
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
              {!selectedSlot && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => {
                            if (date) {
                              setSelectedDate(date);
                              const start = setHours(setMinutes(date, 0), 9);
                              const end = setHours(setMinutes(date, 0), 17);
                              setInternalSlot({ start, end });
                            }
                          }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
              
              {(selectedSlot || internalSlot) && (
                <p className="text-sm font-medium">
                  Session Date: {(() => {
                    try {
                      const slot = selectedSlot || internalSlot;
                      return slot ? format(slot.start, 'MMM dd, yyyy') : 'No date selected';
                    } catch (error) {
                      console.error('Error formatting slot date:', error);
                      return 'Invalid Date';
                    }
                  })()}
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="startTime">Choose a Start Time</Label>
                <Select
                  value={selectedStartTime || ''}
                  onValueChange={setSelectedStartTime}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a start time" />
                  </SelectTrigger>
                  <SelectContent 
                    position="popper" 
                    side="bottom" 
                    align="start" 
                    sideOffset={5}
                    collisionPadding={10}
                    className="!z-[99999] bg-popover border shadow-lg"
                  >
                    {bookableTimeSlots?.length > 0 ? (
                      bookableTimeSlots.map((time, index) => (
                        <SelectItem key={index} value={format(time, 'HH:mm')}>
                          {(() => {
                            try {
                              return format(time, 'h:mm a');
                            } catch (error) {
                              console.error('Error formatting time slot:', error);
                              return 'Invalid Time';
                            }
                          })()}
                        </SelectItem>
                      ))
                    ) : null}
                  </SelectContent>
                </Select>
                {bookableTimeSlots.length === 0 && (
                  <p className="text-muted-foreground text-sm">No available time slots</p>
                )}
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
                  {activeSessionPacks.map(pack => (
                    <div key={pack.id} className="flex items-center space-x-2">
                      <RadioGroupItem value={`pack:${pack.id}`} id={`pack-${pack.id}`} />
                      <Label htmlFor={`pack-${pack.id}`} className="cursor-pointer">
                        <span className="font-medium">Session Pack:</span> {pack.service_types?.name} ({pack.sessions_remaining} remaining)
                      </Label>
                    </div>
                  ))}

                  {activeSubscriptions.map(sub => (
                    <div key={sub.id} className="flex items-center space-x-2">
                      <RadioGroupItem value={`subscription:${sub.id}`} id={`subscription-${sub.id}`} />
                      <Label htmlFor={`subscription-${sub.id}`} className="cursor-pointer">
                        <span className="font-medium">Subscription:</span> {sub.billing_cycle} ({sub.payment_frequency})
                      </Label>
                    </div>
                  ))}

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
              disabled={isLoadingBookingData || isBooking || (!selectedSlot && !internalSlot) || !selectedStartTime || !selectedServiceTypeId || !selectedBookingOption}
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
};