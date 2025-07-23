import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, CalendarIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const sessionFormSchema = z.object({
  client_id: z.string().min(1, 'Please select a client'),
  scheduleType: z.enum(["oneOff", "fromPack", "fromSubscription"]),
  serviceTypeId: z.string().optional(), // Used for 'oneOff'
  packId: z.string().optional(), // Used for 'fromPack'
  subscriptionId: z.string().optional(), // Used for 'fromSubscription'
  serviceTypeIdForSubscription: z.string().optional(), // Used for service selection within 'fromSubscription'
  paymentStatus: z.enum(["paid", "pending", "cancelled"]).optional(),
  session_date: z.date({
    message: 'Please select a session date',
  }),
  session_time: z.string().min(1, 'Please select a session time'),
  status: z.enum(['scheduled', 'completed', 'cancelled_late', 'cancelled_early']),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  // Conditional validation based on scheduleType
  if (data.scheduleType === 'oneOff') {
    if (!data.serviceTypeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Service type is required for a one-off session.",
        path: ['serviceTypeId'],
      });
    }
  } else if (data.scheduleType === 'fromPack') {
    if (!data.packId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A pack must be selected.",
        path: ['packId'],
      });
    }
  } else if (data.scheduleType === 'fromSubscription') {
    if (!data.subscriptionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A subscription must be selected.",
        path: ['subscriptionId'],
      });
    }
    if (data.subscriptionId && !data.serviceTypeIdForSubscription) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A specific service must be selected from the subscription.",
        path: ['serviceTypeIdForSubscription'],
      });
    }
  }

  // Ensure mutual exclusivity (packId, subscriptionId)
  if (data.packId && data.subscriptionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Session cannot be linked to both a pack and a subscription.",
      path: ['packId', 'subscriptionId'],
    });
  }
});

type SessionFormData = z.infer<typeof sessionFormSchema>;

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

  const form = useForm<SessionFormData>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      client_id: initialClientId || '',
      scheduleType: 'oneOff',
      status: 'scheduled',
      notes: '',
      paymentStatus: 'paid',
    },
  });

  const { handleSubmit, formState: { isSubmitting }, reset } = form;

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

      console.log("DEBUG: Fetched active client subscriptions for scheduling (processed):", processedData);
      setActiveClientSubscriptions(processedData);
    } catch (error) {
      console.error('DEBUG: Error fetching active client subscriptions for scheduling:', error);
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

      console.log("DEBUG: Fetched activeSessionPacks data (within fetchActiveSessionPacks):", data);

      if (error) throw error;
      setActiveSessionPacks(data || []);
    } catch (error) {
      console.error('DEBUG: Error fetching active session packs (from fetchActiveSessionPacks):', error);
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

  const onSubmit = async (data: SessionFormData) => {
    try {
      console.log("DEBUG: Form submitted with values BEFORE processing for DB insert:", data);
      
      // Combine date and time into a proper timestamp
      const [hours, minutes] = data.session_time.split(':').map(Number);
      const sessionDateTime = new Date(data.session_date);
      sessionDateTime.setHours(hours, minutes, 0, 0);

      let finalServiceTypeId: string | undefined;
      let finalPackId: string | null = null;
      let finalSubscriptionId: string | null = null;

      if (data.scheduleType === 'oneOff') {
        finalServiceTypeId = data.serviceTypeId;
      } else if (data.scheduleType === 'fromPack') {
        finalPackId = data.packId || null;
        // Derive serviceTypeId from the selected pack
        const selectedPack = activeSessionPacks?.find(pack => pack.id === finalPackId);
        if (selectedPack) {
          finalServiceTypeId = selectedPack.service_type_id;
        } else {
          console.error("DEBUG: Selected pack not found or invalid.");
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
        console.error("DEBUG: Attempting to submit session without a service_type_id derived from selection.");
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
        session_pack_id: finalPackId,
        subscription_id: finalSubscriptionId,
        notes: data.notes || null,
      };

      console.log("DEBUG: Final payload for Supabase insertion:", sessionData);

      const { error } = await supabase
        .from('sessions')
        .insert([sessionData]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Session scheduled successfully!',
      });

      reset();
    } catch (error) {
      console.error('Error scheduling session:', error);
      toast({
        title: 'Error',
        description: 'Failed to schedule session. Please try again.',
        variant: 'destructive',
      });
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

  // Debug logs for conditional rendering
  console.log("DEBUG: Render Check: activeSessionPacks.length:", activeSessionPacks.length);
  console.log("DEBUG: Render Check: isLoadingPacks:", isLoadingPacks);

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
                        console.log("DEBUG: Schedule Type changed to:", value);
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
                            console.log("DEBUG: Selected subscription ID:", value);
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

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Scheduling...' : 'Schedule Session'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}