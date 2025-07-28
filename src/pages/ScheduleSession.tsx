import { useNavigate, useSearchParams } from 'react-router-dom';
import React, { useEffect, useState, useMemo } from 'react';
import { useForm, Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, addMonths, isBefore, isAfter, parse, addMinutes, isWithinInterval } from 'date-fns';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, CalendarIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionOverlapCheck, validateOverlap } from '@/hooks/useSessionOverlapCheck';
import ConfirmAvailabilityOverrideModal from '@/components/ConfirmAvailabilityOverrideModal';

// Create the base schema with dynamic validation using context
const ScheduleSessionSchema = z.object({
  client_id: z.string().min(1, 'Please select a client'),
  scheduleType: z.enum(["oneOff", "fromPack", "fromSubscription"]),
  serviceTypeId: z.string().optional(),
  packId: z.string().optional(),
  subscriptionId: z.string().optional(),
  serviceTypeIdForSubscription: z.string().optional(),
  paymentStatus: z.enum(["paid", "pending", "cancelled"]).optional(),
  session_date: z.date({
    message: 'Please select a session date',
  }),
  session_time: z.string().min(1, 'Please select a session time'),
  status: z.enum(['scheduled', 'completed', 'cancelled_late', 'cancelled_early']),
  notes: z.string().optional(),
  isFromCredit: z.boolean().optional(),
  creditIdConsumed: z.string().optional(),
  selectedCreditId: z.string().optional(),
});

type SessionFormData = z.infer<typeof ScheduleSessionSchema>;

interface Client {
  id: string;
  name: string;
}

interface ServiceType {
  id: string;
  name: string;
}

export default function ScheduleSession() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get('clientId');
  const [clients, setClients] = useState<Client[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [activeSessionPacks, setActiveSessionPacks] = useState<any[]>([]);
  const [activeClientSubscriptions, setActiveClientSubscriptions] = useState<any[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingServiceTypes, setIsLoadingServiceTypes] = useState(true);
  const [isLoadingPacks, setIsLoadingPacks] = useState(true);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(true);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const queryClient = useQueryClient();

  // NEW STATE for availability override modal
  const [showAvailabilityOverrideConfirm, setShowAvailabilityOverrideConfirm] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<SessionFormData | null>(null);

  const DEFAULT_SESSION_DURATION_MINUTES = 60;

  // Initialize form - context will be handled through manual validation
  const form = useForm<SessionFormData>({
    resolver: zodResolver(ScheduleSessionSchema),
    mode: 'onChange',
    defaultValues: {
      client_id: initialClientId || '',
      scheduleType: 'oneOff',
      status: 'scheduled',
      notes: '',
      paymentStatus: 'paid',
    },
  });

  const { handleSubmit, formState: { isSubmitting }, reset } = form;

  // Watch form fields for reactivity
  const watchedSessionDate = form.watch('session_date');
  const watchedSessionTime = form.watch('session_time');
  const watchedSessionStatus = form.watch('status');

  // Use the reusable overlap check hook
  const { isLoadingOverlaps, overlappingSessionsCount } = useSessionOverlapCheck({
    trainerId: user?.id,
    proposedDate: watchedSessionDate,
    proposedTime: watchedSessionTime,
    proposedStatus: watchedSessionStatus,
    sessionIdToExclude: undefined, // No session to exclude for new bookings
    enabled: true, // This hook should always be enabled when the form is interactive
  });

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
    enabled: !!user?.id,
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
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  // Fetch available credits for subscription sessions
  const { data: availableCredits, isLoading: isLoadingCredits } = useQuery({
    queryKey: ['availableCredits', form.watch('client_id'), form.watch('subscriptionId'), form.watch('serviceTypeIdForSubscription')],
    queryFn: async () => {
      const currentServiceTypeId = form.getValues('serviceTypeIdForSubscription');
      const currentSubscriptionId = form.getValues('subscriptionId');
      const currentClientId = form.getValues('client_id');
      
      if (!currentClientId || !currentSubscriptionId || !currentServiceTypeId) return [];

      const { data, error } = await supabase
        .from('subscription_session_credits')
        .select(`
          id,
          credit_value,
          credit_reason,
          created_at,
          status
        `)
        .eq('subscription_id', currentSubscriptionId)
        .eq('service_type_id', currentServiceTypeId)
        .eq('status', 'available')
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }
      return data || [];
    },
    enabled: !!form.watch('client_id') && !!form.watch('subscriptionId') && !!form.watch('serviceTypeIdForSubscription'),
  });

  // Function to calculate the period start/end dates based on subscription start date and period type
  const calculatePeriodDates = React.useCallback((
    subscriptionStartDate: string | Date,
    proposedSessionDate: Date,
    periodType: 'weekly' | 'fortnightly' | 'monthly'
  ) => {
    const subStartDate = new Date(subscriptionStartDate);
    let periodStart: Date;
    let periodEnd: Date;

    if (periodType === 'weekly') {
      // Find the start of the week containing proposedSessionDate, aligned with subStartDate's weekday
      let currentWeekStart = startOfWeek(proposedSessionDate, { weekStartsOn: subStartDate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
      // Adjust to align with the subscription's start week
      while (isBefore(currentWeekStart, subStartDate)) {
        currentWeekStart = addWeeks(currentWeekStart, 1);
      }
      while (isAfter(currentWeekStart, proposedSessionDate)) {
        currentWeekStart = addWeeks(currentWeekStart, -1);
      }
      periodStart = currentWeekStart;
      periodEnd = addWeeks(periodStart, 1);
    } else if (periodType === 'fortnightly') {
      // Find the start of the fortnight containing proposedSessionDate, aligned with subStartDate
      const totalDaysSinceSubStart = Math.floor((proposedSessionDate.getTime() - subStartDate.getTime()) / (1000 * 60 * 60 * 24));
      const fortnightsPassed = Math.floor(totalDaysSinceSubStart / 14);
      periodStart = addWeeks(subStartDate, fortnightsPassed * 2);
      periodEnd = addWeeks(periodStart, 2);
    } else if (periodType === 'monthly') {
      // Find the start of the month containing proposedSessionDate, aligned with subStartDate's day
      // For monthly periods starting on the subscription start date
      periodStart = startOfMonth(proposedSessionDate);
      while (isBefore(periodStart, subStartDate) && isBefore(addMonths(periodStart, 1), proposedSessionDate)) {
        periodStart = addMonths(periodStart, 1);
      }
      if (isAfter(periodStart, proposedSessionDate)) {
        periodStart = addMonths(periodStart, -1);
      }
      periodEnd = addMonths(periodStart, 1);
    } else {
      // Fallback for unexpected period types
      return { periodStartDate: null, periodEndDate: null };
    }

    return { periodStartDate: periodStart, periodEndDate: periodEnd };
  }, []);

  // Calculate current period dates based on form values
  const { periodStartDate, periodEndDate } = React.useMemo(() => {
    const currentSubscriptionId = form.watch('subscriptionId');
    const currentServiceTypeId = form.watch('serviceTypeIdForSubscription');
    const currentSessionDate = form.watch('session_date');
    
    if (currentSubscriptionId && currentServiceTypeId && currentSessionDate) {
      const selectedSubscription = activeClientSubscriptions?.find(s => s.id === currentSubscriptionId);
      const allocation = selectedSubscription?.subscription_service_allocations?.find(
        alloc => alloc.service_type_id === currentServiceTypeId
      );
      
      if (selectedSubscription && selectedSubscription.start_date && allocation) {
        return calculatePeriodDates(
          selectedSubscription.start_date,
          currentSessionDate,
          allocation.period_type as 'weekly' | 'fortnightly' | 'monthly'
        );
      }
    }
    return { periodStartDate: null, periodEndDate: null };
  }, [form.watch('subscriptionId'), form.watch('serviceTypeIdForSubscription'), form.watch('session_date'), activeClientSubscriptions, calculatePeriodDates]);

  // Enhanced period sessions query with dynamic period calculation and credit exclusion
  const { data: updatedScheduledSessionsInPeriod, isLoading: updatedIsLoadingPeriodSessions } = useQuery({
    queryKey: ['scheduledSessionsInPeriod', form.watch('client_id'), form.watch('subscriptionId'), form.watch('serviceTypeIdForSubscription'), periodStartDate?.toISOString(), periodEndDate?.toISOString()],
    queryFn: async () => {
      const currentServiceTypeId = form.getValues('serviceTypeIdForSubscription');
      const currentClientId = form.getValues('client_id');
      const currentSubscriptionId = form.getValues('subscriptionId');
      const currentScheduleType = form.getValues('scheduleType');
      
      if (currentScheduleType !== 'fromSubscription' || !currentSubscriptionId || !currentServiceTypeId || !periodStartDate || !periodEndDate || !currentClientId) {
        return 0;
      }

      // Count sessions already scheduled within this period for this subscription and service type
      const { count, error } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true }) // Using head: true for count only
        .eq('client_id', currentClientId)
        .eq('subscription_id', currentSubscriptionId)
        .eq('service_type_id', currentServiceTypeId)
        .gte('session_date', periodStartDate.toISOString())
        .lt('session_date', periodEndDate.toISOString())
        .eq('is_from_credit', false) // Exclude sessions booked from credits
        .in('status', ['scheduled', 'completed', 'cancelled_late', 'cancelled_early']); // Include these statuses in count

      if (error) {
        throw error;
      }
      return count ?? 0;
    },
    enabled: form.watch('scheduleType') === 'fromSubscription' && !!form.watch('subscriptionId') && !!form.watch('serviceTypeIdForSubscription') && !!periodStartDate && !!periodEndDate && !!form.watch('client_id'),
    staleTime: 5 * 1000, // Short cache for rapid updates during scheduling
  });

  // Use the working query data (provide defaults to avoid undefined)
  const finalScheduledSessionsInPeriod = updatedScheduledSessionsInPeriod ?? 0;
  const finalIsLoadingPeriodSessions = updatedIsLoadingPeriodSessions || false;

  // Get current service allocation for validation context
  const currentServiceAllocation = React.useMemo(() => {
    const currentSubscriptionId = form.watch('subscriptionId');
    const currentServiceTypeId = form.watch('serviceTypeIdForSubscription');
    
    if (!activeClientSubscriptions || !currentSubscriptionId || !currentServiceTypeId) {
      return undefined;
    }
    
    const selectedSubscription = activeClientSubscriptions.find(
      (sub) => sub.id === currentSubscriptionId
    );
    
    if (!selectedSubscription || !selectedSubscription.subscription_service_allocations) {
      return undefined;
    }
    
    return selectedSubscription.subscription_service_allocations.find(
      (alloc: { service_type_id: string; quantity_per_period: number; period_type: string; }) =>
        alloc.service_type_id === currentServiceTypeId
    ) as { service_type_id: string; quantity_per_period: number; period_type: 'weekly' | 'fortnightly' | 'monthly'; } | undefined;
  }, [activeClientSubscriptions, form.watch('subscriptionId'), form.watch('serviceTypeIdForSubscription')]);

  // NEW: Process availability (templates + exceptions) 
  const finalAvailabilityMap = useMemo(() => {
    const map = new Map<string, { type: 'available' | 'unavailable' | 'override', ranges: Array<{ start: Date; end: Date }> }>();

    const tempDateForParsing = new Date(); // Use a temp date for parsing times

    // 1. Initialize from recurring templates
    (recurringTemplates || []).forEach(template => {
      const dayName = template.day_of_week;
      const start = parse(template.start_time, 'HH:mm', tempDateForParsing);
      const end = parse(template.end_time, 'HH:mm', tempDateForParsing);
      
      if (!map.has(dayName)) {
        map.set(dayName, { type: 'available', ranges: [] });
      }
      map.get(dayName)!.ranges.push({ start, end });
    });

    // 2. Apply exceptions (override recurring templates)
    (exceptions || []).forEach(exception => {
      const exceptionDate = new Date(exception.exception_date);
      const dayKey = format(exceptionDate, 'yyyy-MM-dd');

      if (exception.exception_type === 'unavailable_full_day') {
        map.set(dayKey, { type: 'unavailable', ranges: [] });
      } else if (exception.exception_type === 'unavailable_partial_day') {
        const dayOfWeekLowercase = format(exceptionDate, 'EEEE').toLowerCase();
        const existingRanges = map.get(dayKey)?.ranges || map.get(dayOfWeekLowercase)?.ranges || [];

        const unavailableStart = parse(exception.start_time || '00:00', 'HH:mm', exceptionDate);
        const unavailableEnd = parse(exception.end_time || '23:59', 'HH:mm', exceptionDate);

        const newRanges: Array<{start: Date; end: Date}> = [];
        existingRanges.forEach(range => {
          if (range.start < unavailableEnd && range.end > unavailableStart) {
            // There is an overlap
            if (range.start < unavailableStart && range.end > unavailableEnd) {
              // Split the range
              newRanges.push({ start: range.start, end: unavailableStart });
              newRanges.push({ start: unavailableEnd, end: range.end });
            } else if (range.start < unavailableEnd && range.end > unavailableEnd) {
              // Unavailable cuts off the start
              newRanges.push({ start: unavailableEnd, end: range.end });
            } else if (range.start < unavailableStart && range.end > unavailableStart) {
              // Unavailable cuts off the end
              newRanges.push({ start: range.start, end: unavailableStart });
            }
            // If unavailable completely covers existing, don't add to newRanges
          } else {
            // No overlap, keep the existing range
            newRanges.push(range);
          }
        });
        map.set(dayKey, { type: 'override', ranges: newRanges });

      } else if (exception.exception_type === 'available_extra_slot') {
        const dayOfWeekLowercase = format(exceptionDate, 'EEEE').toLowerCase();
        const existingRanges = map.get(dayKey)?.ranges || map.get(dayOfWeekLowercase)?.ranges || [];
        const extraStart = parse(exception.start_time || '00:00', 'HH:mm', exceptionDate);
        const extraEnd = parse(exception.end_time || '23:59', 'HH:mm', exceptionDate);

        const allRanges = [...existingRanges, { start: extraStart, end: extraEnd }];
        allRanges.sort((a,b) => a.start.getTime() - b.start.getTime());
        const mergedRanges: Array<{start: Date; end: Date}> = [];
        if(allRanges.length > 0) {
          let currentMerge = allRanges[0];
          for(let i = 1; i < allRanges.length; i++) {
            if (allRanges[i].start.getTime() <= currentMerge.end.getTime()) {
              currentMerge.end = new Date(Math.max(currentMerge.end.getTime(), allRanges[i].end.getTime()));
            } else {
              mergedRanges.push(currentMerge);
              currentMerge = allRanges[i];
            }
          }
          mergedRanges.push(currentMerge);
        }
        map.set(dayKey, { type: 'override', ranges: mergedRanges });
      }
    });

    return map;
  }, [recurringTemplates, exceptions]);

  // NEW: Check if proposed session is outside availability
  const isOutsideAvailability = useMemo(() => {
    if (!watchedSessionDate || !watchedSessionTime || watchedSessionStatus !== 'scheduled') {
      return false; // Only check if date/time/status are set and status is scheduled
    }
    const proposedSessionStart = parse(watchedSessionTime, 'HH:mm', watchedSessionDate);
    const proposedSessionEnd = addMinutes(proposedSessionStart, DEFAULT_SESSION_DURATION_MINUTES);

    const dayKey = format(watchedSessionDate, 'yyyy-MM-dd');
    const dayOfWeekLowercase = format(watchedSessionDate, 'EEEE').toLowerCase();

    // Get availability for this exact day (exceptions take precedence over recurring)
    const availabilityForThisDay = finalAvailabilityMap.get(dayKey) || finalAvailabilityMap.get(dayOfWeekLowercase);

    if (!availabilityForThisDay || availabilityForThisDay.type === 'unavailable') {
      return true; // Outside availability
    }

    // Check if session falls within any of the available ranges for this day
    const fallsWithinAvailableBlock = availabilityForThisDay.ranges.some(block =>
      proposedSessionStart >= block.start && proposedSessionEnd <= block.end
    );

    return !fallsWithinAvailableBlock; // If it doesn't fall within any, it's outside
  }, [watchedSessionDate, watchedSessionTime, watchedSessionStatus, finalAvailabilityMap]);

  // Critical part: Perform custom validation logic
  useEffect(() => {
    if (finalScheduledSessionsInPeriod !== undefined && currentServiceAllocation !== undefined && !finalIsLoadingPeriodSessions) {
      // Perform the over-scheduling check manually
      const formValues = form.getValues();
      if (formValues.scheduleType === 'fromSubscription' && !formValues.selectedCreditId) {
        if (finalScheduledSessionsInPeriod >= currentServiceAllocation.quantity_per_period) {
          form.setError('session_date', {
            type: 'custom',
            message: `You have exceeded the allocated sessions (${currentServiceAllocation.quantity_per_period}) for this subscription within the current ${currentServiceAllocation.period_type} period.`,
          });
        } else {
          form.clearErrors('session_date');
        }
      }
    }
  }, [finalScheduledSessionsInPeriod, finalIsLoadingPeriodSessions, currentServiceAllocation, form]);

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

  useEffect(() => {
    if (user?.id) {
      fetchClients();
      fetchServiceTypes();
    }
  }, [user?.id]);

const fetchActiveClientSubscriptions = async (clientId: string) => {
    if (!clientId || !user?.id) return;
    
    try {
      setIsLoadingSubscriptions(true);
      const { data, error } = await supabase
        .from('client_subscriptions')
        .select(`
          id,
          billing_cycle,
          start_date,
          subscription_service_allocations (
            service_type_id,
            period_type,
            quantity_per_period,
            service_types (name)
          )
        `)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('start_date', { ascending: false });

      if (error) throw error;
      
      // Ensure that nested arrays are not null if not present
      const processedData = data?.map(sub => ({
        ...sub,
        subscription_service_allocations: sub.subscription_service_allocations || []
      })) || [];

      setActiveClientSubscriptions(processedData);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load subscriptions. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSubscriptions(false);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('trainer_id', user?.id)
        .order('name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load clients. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingClients(false);
    }
  };

  const fetchServiceTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('service_types')
        .select('id, name')
        .eq('trainer_id', user?.id)
        .order('name');

      if (error) throw error;
      setServiceTypes(data || []);
    } catch (error) {
      console.error('Error fetching service types:', error);
      toast({
        title: 'Error',
        description: 'Failed to load service types. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingServiceTypes(false);
    }
  };

  const fetchActiveSessionPacks = async (clientId: string) => {
    if (!clientId || !user?.id) return;
    
    try {
      setIsLoadingPacks(true);
      const { data, error } = await supabase
        .from('session_packs')
        .select('id, service_type_id, total_sessions, sessions_remaining, service_types(name)')
        .eq('trainer_id', user.id)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .gt('sessions_remaining', 0)
        .order('sessions_remaining', { ascending: true });

      if (error) throw error;
      setActiveSessionPacks(data || []);
    } catch (error) {
      console.error('Error fetching session packs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load session packs. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPacks(false);
    }
  };

  // NEW: Helper to extract booking logic (called by onSubmit and handleConfirmOverride)
  const proceedWithBooking = async (data: SessionFormData) => {
    try {
      // Combine date and time into a proper timestamp
      const [hours, minutes] = data.session_time.split(':').map(Number);
      const sessionDateTime = new Date(data.session_date);
      sessionDateTime.setHours(hours, minutes, 0, 0);

      let finalServiceTypeId: string | undefined;
      let finalPackId: string | null = null;
      let finalSubscriptionId: string | null = null;

      // Handle credit usage flags
      let finalIsFromCredit = false;
      let finalCreditIdConsumed: string | null = null;

      if (data.scheduleType === 'fromSubscription' && data.selectedCreditId) {
        finalIsFromCredit = true;
        finalCreditIdConsumed = data.selectedCreditId;
      }

      if (data.scheduleType === 'oneOff') {
        finalServiceTypeId = data.serviceTypeId;
      } else if (data.scheduleType === 'fromPack') {
        finalPackId = data.packId || null;
        // Derive serviceTypeId from the selected pack
        const selectedPack = activeSessionPacks?.find(pack => pack.id === finalPackId);
        if (selectedPack) {
          finalServiceTypeId = selectedPack.service_type_id;
        } else {
          toast({
            title: 'Error',
            description: 'Selected pack is invalid. Please try again.',
            variant: 'destructive',
          });
          return;
        }
      } else if (data.scheduleType === 'fromSubscription') {
        finalSubscriptionId = data.subscriptionId || null;
        finalServiceTypeId = data.serviceTypeIdForSubscription; // Service type comes from subscription's dropdown
      }

      // Final check for serviceTypeId before proceeding
      if (!finalServiceTypeId) {
        toast({
          title: 'Error',
          description: 'A service type must be associated with the session. Please complete all required selections.',
          variant: 'destructive',
        });
        return;
      }

      const sessionData = {
        trainer_id: user?.id,
        client_id: data.client_id,
        service_type_id: finalServiceTypeId,
        session_date: sessionDateTime.toISOString(),
        status: data.status,
        notes: data.notes || null,
        session_pack_id: finalPackId,
        subscription_id: finalSubscriptionId,
        is_from_credit: finalIsFromCredit,
        credit_id_consumed: finalCreditIdConsumed,
      };

      const { data: sessionInsertData, error: sessionInsertError } = await supabase
        .from('sessions')
        .insert([sessionData])
        .select()
        .single();

      if (sessionInsertError) {
        throw new Error(`Failed to schedule session: ${sessionInsertError.message}`);
      }

      // Handle credit consumption for subscription sessions
      if (data.scheduleType === 'fromSubscription' && data.selectedCreditId) {
        const { error: creditUpdateError } = await supabase
          .from('subscription_session_credits')
          .update({ 
            status: 'used_for_session',
            used_at: new Date().toISOString()
          })
          .eq('id', data.selectedCreditId);

        if (creditUpdateError) {
          console.error("Failed to update credit status:", creditUpdateError);
          toast({
            title: 'Warning',
            description: 'Session scheduled, but failed to update credit status.',
            variant: 'destructive',
          });
        }
      }

      toast({
        title: 'Success',
        description: 'Session scheduled successfully!',
      });
      
      reset();
      queryClient.invalidateQueries({ queryKey: ['sessionsForClient'] });
      queryClient.invalidateQueries({ queryKey: ['availableCredits'] });
      queryClient.invalidateQueries({ queryKey: ['trainerSessions', user?.id] });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: `Error scheduling session: ${error.message}`,
        variant: 'destructive',
      });
      console.error("Error scheduling session:", error);
    } finally {
      setIsSubmittingForm(false);
      queryClient.invalidateQueries({ queryKey: ['sessionsForClient'] });
      queryClient.invalidateQueries({ queryKey: ['availableCredits'] });
    }
  };

  const onSubmit = async (data: SessionFormData) => {
    setIsSubmittingForm(true);

    // --- CRITICAL MANUAL VALIDATION STEP ---
    // Trigger validation for the fields relevant to the allocation check
    const isValid = await form.trigger(['session_date', 'serviceTypeIdForSubscription']);
    // After triggering, check if the form is valid based on the latest state
    if (!isValid || isLoadingOverlaps) {
      toast({
        title: 'Validation Error',
        description: 'Please correct the errors in the form before scheduling.',
        variant: 'destructive',
      });
      // Optional: Set focus to the first error field
      const firstError = Object.keys(form.formState.errors).find(key => form.formState.errors[key]);
      if (firstError) {
        form.setFocus(firstError as Path<SessionFormData>);
      }
      setIsSubmittingForm(false);
      return;
    }
    // --- END CRITICAL MANUAL VALIDATION STEP ---

    // NEW: Soft validation for availability override
    if (watchedSessionStatus === 'scheduled' && isOutsideAvailability) {
      setPendingSubmitData(data); // Store data to use after confirmation
      setShowAvailabilityOverrideConfirm(true);
      setIsSubmittingForm(false); // Stop submitting while confirmation is active
      return; // INTERCEPT HERE
    }

    // If no override, proceed directly
    await proceedWithBooking(data);
  };

  // NEW: Handle confirmation from override modal
  const handleConfirmAvailabilityOverride = async () => {
    setShowAvailabilityOverrideConfirm(false); // Close confirmation modal
    if (pendingSubmitData) {
      await proceedWithBooking(pendingSubmitData); // Proceed with original booking
      setPendingSubmitData(null); // Clear pending data
    } else {
      toast({ title: 'Error', description: 'No session data to confirm.', variant: 'destructive' });
      setIsSubmittingForm(false);
    }
  };

  // Set form value when clients load and initialClientId exists
  useEffect(() => {
    if (initialClientId && clients.length > 0) {
      form.setValue('client_id', initialClientId);
      fetchActiveSessionPacks(initialClientId);
    }
  }, [initialClientId, clients, form]);

  // Watch for client changes to fetch session packs and subscriptions
  useEffect(() => {
    const clientId = form.watch('client_id');
    if (clientId) {
      fetchActiveSessionPacks(clientId);
      fetchActiveClientSubscriptions(clientId);
    } else {
      setActiveSessionPacks([]);
      setActiveClientSubscriptions([]);
      setIsLoadingPacks(false);
      setIsLoadingSubscriptions(false);
    }
  }, [form.watch('client_id')]);

  const handleBack = () => {
    navigate(-1);
  };

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

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={handleBack}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return
          </Button>
          
          <h1 className="text-heading-1 mb-4">Schedule New Session</h1>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Session Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger disabled={!!initialClientId}>
                            <SelectValue placeholder={isLoadingClients ? "Loading clients..." : "Select a client"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients.length === 0 && !isLoadingClients ? (
                            <SelectItem value="no-clients" disabled>No clients found</SelectItem>
                          ) : (
                            clients.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* New: Schedule Type Selection */}
                <FormField
                  control={form.control}
                  name="scheduleType"
                  render={({ field }) => (
                    <FormItem className="mb-4">
                      <FormLabel>Schedule Type</FormLabel>
                      <Select onValueChange={(value: "oneOff" | "fromPack" | "fromSubscription") => {
                        field.onChange(value);
                        // Reset relevant fields when scheduleType changes
                        form.setValue("serviceTypeId", undefined);
                        form.setValue("packId", undefined);
                        form.setValue("subscriptionId", undefined);
                        form.setValue("serviceTypeIdForSubscription", undefined);
                        form.setValue("paymentStatus", undefined);
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select how to schedule" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="oneOff">One-Off Service</SelectItem>
                          <SelectItem value="fromPack">From Pack</SelectItem>
                          <SelectItem value="fromSubscription">From Subscription</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Conditional Rendering for Service Type (One-Off) */}
                {form.watch("scheduleType") === 'oneOff' && (
                  <FormField
                    control={form.control}
                    name="serviceTypeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a service type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingServiceTypes ? (
                              <SelectItem value="loading" disabled>Loading services...</SelectItem>
                            ) : (
                              serviceTypes?.map((serviceType) => (
                                <SelectItem key={serviceType.id} value={serviceType.id}>
                                  {serviceType.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Conditional Rendering for Payment Status (Only for One-Off) */}
                {form.watch("scheduleType") === 'oneOff' && (
                  <FormField
                    control={form.control}
                    name="paymentStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select payment status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Conditional Rendering for Pack Selection */}
                {form.watch("scheduleType") === 'fromPack' && (
                  <FormField
                    control={form.control}
                    name="packId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Pack</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an active pack" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingPacks ? (
                              <SelectItem value="loading" disabled>Loading packs...</SelectItem>
                            ) : activeSessionPacks?.length === 0 ? (
                              <SelectItem value="no-options" disabled>No active packs found</SelectItem>
                            ) : (
                              activeSessionPacks?.map((pack) => (
                                <SelectItem key={pack.id} value={pack.id}>
                                  {`Pack: ${pack.service_types?.name || 'Unknown'} (${pack.sessions_remaining} remaining)`}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Conditional Rendering for Subscription Selection */}
                {form.watch("scheduleType") === 'fromSubscription' && (
                  <>
                    <FormField
                      control={form.control}
                      name="subscriptionId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Subscription</FormLabel>
                          <Select onValueChange={(value) => {
                            field.onChange(value);
                            form.setValue("serviceTypeIdForSubscription", undefined);
                          }} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select an active subscription" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isLoadingSubscriptions ? (
                                <SelectItem value="loading" disabled>Loading subscriptions...</SelectItem>
                              ) : activeClientSubscriptions?.length === 0 ? (
                                <SelectItem value="no-options" disabled>No active subscriptions found</SelectItem>
                              ) : (
                                activeClientSubscriptions?.map((sub) => (
                                  <SelectItem key={sub.id} value={sub.id}>
                                    {`Subscription: ${sub.billing_cycle.charAt(0).toUpperCase() + sub.billing_cycle.slice(1)} (${format(new Date(sub.start_date), 'MMM yy')})`}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Conditional Rendering for Service Selection from Subscription */}
                    {form.watch("subscriptionId") && (
                      <FormField
                        control={form.control}
                        name="serviceTypeIdForSubscription"
                        render={({ field }) => {
                          const selectedSubscriptionId = form.watch("subscriptionId");
                          const selectedSubscription = activeClientSubscriptions?.find(sub => sub.id === selectedSubscriptionId);
                          const servicesInSelectedSubscription = selectedSubscription?.subscription_service_allocations?.map(alloc => ({
                            id: alloc.service_type_id,
                            name: alloc.service_types?.name || 'Unknown Service',
                          })) || [];

                          return (
                            <FormItem>
                              <FormLabel>Select Service from Subscription</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a service from subscription" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {servicesInSelectedSubscription.length === 0 ? (
                                    <SelectItem value="no-services" disabled>No services found for this subscription</SelectItem>
                                  ) : (
                                    servicesInSelectedSubscription.map((serviceType) => (
                                      <SelectItem key={serviceType.id} value={serviceType.id}>
                                        {serviceType.name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    )}

                     {/* Credit Selection for Subscription Sessions */}
                    {form.watch("subscriptionId") && form.watch("serviceTypeIdForSubscription") && (
                      <FormField
                        control={form.control}
                        name="selectedCreditId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Use an Available Credit (Optional)</FormLabel>
                            <Select
                              value={field.value || "no-credit"}
                              onValueChange={(value) => {
                                if (value === "no-credit") {
                                  field.onChange(undefined);
                                } else {
                                  field.onChange(value);
                                }
                              }}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={
                                    field.value ? `Using ${availableCredits?.find(c => c.id === field.value)?.credit_reason || 'a credit'}` :
                                    (isLoadingCredits ? "Loading credits..." : `Available: ${availableCredits?.length || 0}`)
                                  } />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {isLoadingCredits ? (
                                  <SelectItem value="loading" disabled>Loading credits...</SelectItem>
                                ) : availableCredits?.length === 0 ? (
                                  <SelectItem value="no-credits" disabled>No available credits for this service</SelectItem>
                                ) : (
                                  <>
                                    <SelectItem value="no-credit">Do not use a credit</SelectItem>
                                    {availableCredits?.map((credit) => (
                                      <SelectItem key={credit.id} value={credit.id}>
                                        {`Credit: ${format(new Date(credit.created_at), 'MMM dd')} - ${credit.credit_reason || 'No reason'}`}
                                      </SelectItem>
                                    ))}
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              {availableCredits?.length > 0
                                ? `You have ${availableCredits.length} available credits for this service.`
                                : "No credits available for this service type within the selected subscription."}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </>
                )}

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
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date()}
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
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional notes about this session..."
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={form.formState.isSubmitting || !form.formState.isValid || finalIsLoadingPeriodSessions || isLoadingOverlaps}
                >
                  {form.formState.isSubmitting ? "Scheduling..." : 
                   isLoadingOverlaps ? "Checking Overlaps..." :
                   finalIsLoadingPeriodSessions ? "Checking Allocation..." :
                   "Schedule Session"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>

      {/* NEW: Render ConfirmAvailabilityOverrideModal */}
      {showAvailabilityOverrideConfirm && watchedSessionDate && watchedSessionTime && (
        <ConfirmAvailabilityOverrideModal
          isOpen={showAvailabilityOverrideConfirm}
          onClose={() => {
            setShowAvailabilityOverrideConfirm(false);
            setPendingSubmitData(null); // Clear pending data if user cancels
            setIsSubmittingForm(false); // Ensure button state is reset
          }}
          onConfirm={handleConfirmAvailabilityOverride}
          proposedDateTime={parse(watchedSessionTime, 'HH:mm', watchedSessionDate)}
        />
      )}
    </div>
  );
}