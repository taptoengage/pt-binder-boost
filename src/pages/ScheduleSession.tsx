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
  sessionTypeSelection: z.enum(["onceOff", "fromPack"]),
  service_type_id: z.string().optional(),
  session_pack_id: z.string().optional().nullable(),
  subscription_id: z.string().optional(),
  paymentStatus: z.enum(["paid", "pending", "cancelled"]).optional(),
  session_date: z.date({
    message: 'Please select a session date',
  }),
  session_time: z.string().min(1, 'Please select a session time'),
  status: z.enum(['scheduled', 'completed', 'cancelled_late', 'cancelled_early']),
  notes: z.string().optional(),
}).refine((data) => {
  if (data.sessionTypeSelection === 'onceOff') {
    return data.service_type_id ? true : false;
  }
  if (data.sessionTypeSelection === 'fromPack') {
    return data.session_pack_id || data.subscription_id ? true : false;
  }
  return true;
}, {
  message: "Please select a service type, a pack, or a subscription.",
  path: ["service_type_id", "session_pack_id", "subscription_id"],
}).refine((data) => {
  if (data.session_pack_id && data.subscription_id) {
    return false;
  }
  return true;
}, {
  message: "A session cannot be linked to both a pack and a subscription.",
  path: ["session_pack_id", "subscription_id"],
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
      sessionTypeSelection: 'fromPack',
      status: 'scheduled',
      notes: '',
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
      console.log("DEBUG: Form submitted with values BEFORE processing:", data);
      
      // Combine date and time into a proper timestamp
      const [hours, minutes] = data.session_time.split(':').map(Number);
      const sessionDateTime = new Date(data.session_date);
      sessionDateTime.setHours(hours, minutes, 0, 0);

      let finalServiceTypeId: string | undefined = data.service_type_id;

      // If a pack or subscription is selected, derive serviceTypeId
      if (data.sessionTypeSelection === 'fromPack') {
        if (data.session_pack_id && data.session_pack_id !== "none") {
          const selectedPack = activeSessionPacks?.find(pack => pack.id === data.session_pack_id);
          if (selectedPack) {
            finalServiceTypeId = selectedPack.service_type_id;
            console.log("DEBUG: Service Type ID derived from selected pack:", finalServiceTypeId);
          }
        } else if (data.subscription_id) {
          const selectedSub = activeClientSubscriptions?.find(sub => sub.id === data.subscription_id);
          if (selectedSub && data.service_type_id) {
            finalServiceTypeId = data.service_type_id;
            console.log("DEBUG: Service Type ID derived from selected subscription and dropdown:", finalServiceTypeId);
          } else {
            console.error("DEBUG: Subscription selected but no service type selected or subscription not found.");
            toast({
              title: 'Error',
              description: 'Please select a service type from the subscription options.',
              variant: 'destructive',
            });
            return;
          }
        } else {
          console.error("DEBUG: Session type 'fromPack' selected but neither pack nor subscription ID found.");
          toast({
            title: 'Error',
            description: 'Please select a valid pack or subscription.',
            variant: 'destructive',
          });
          return;
        }
      }

      // Ensure service_type_id is not undefined before inserting, as it's NOT NULL
      if (!finalServiceTypeId) {
        console.error("DEBUG: Attempting to submit session without a service_type_id.");
        toast({
          title: 'Error',
          description: 'A service type must be associated with the session.',
          variant: 'destructive',
        });
        return;
      }

      // Ensure only one of pack_id or subscription_id is set
      if (data.session_pack_id && data.subscription_id) {
        console.error("DEBUG: Attempting to link session to both pack and subscription.");
        toast({
          title: 'Error',
          description: 'A session cannot be linked to both a pack and a subscription.',
          variant: 'destructive',
        });
        return;
      }

      if (!data.session_pack_id && !data.subscription_id && data.sessionTypeSelection === 'fromPack') {
        console.error("DEBUG: Session type 'fromPack' selected but neither pack nor subscription ID found.");
        toast({
          title: 'Error',
          description: 'Please select a valid pack or subscription.',
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
        session_pack_id: data.sessionTypeSelection === 'fromPack' && data.session_pack_id !== "none" ? data.session_pack_id : null,
        subscription_id: data.sessionTypeSelection === 'fromPack' && data.subscription_id ? data.subscription_id : null,
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

                <FormField
                  control={form.control}
                  name="sessionTypeSelection"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Session Type Selection</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        if (value === 'onceOff') {
                          form.setValue("session_pack_id", undefined);
                        } else {
                          form.setValue("service_type_id", undefined);
                          form.setValue("paymentStatus", undefined);
                        }
                      }} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select session type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="fromPack">Assign from Pack or Subscription</SelectItem>
                          <SelectItem value="onceOff">Schedule a once-off service</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="service_type_id"
                  render={({ field }) => {
                    const sessionTypeSelection = form.watch("sessionTypeSelection");
                    const selectedSubscriptionId = form.watch("subscription_id");
                    const selectedSubscription = activeClientSubscriptions?.find(sub => sub.id === selectedSubscriptionId);
                    
                    return (
                      <FormItem>
                        <FormLabel>Schedule a service type</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value || ''}
                          disabled={sessionTypeSelection === 'fromPack' && !selectedSubscriptionId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingServiceTypes ? "Loading service types..." : "Select a service type"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingServiceTypes ? (
                              <SelectItem value="loading" disabled>Loading services...</SelectItem>
                            ) : (
                              serviceTypes
                                .filter(st => {
                                  if (selectedSubscriptionId && selectedSubscription) {
                                    const serviceTypeIdsInSubscription = selectedSubscription.subscription_service_allocations?.map(alloc => alloc.service_type_id) || [];
                                    return serviceTypeIdsInSubscription.includes(st.id);
                                  }
                                  return true;
                                })
                                .map((serviceType) => (
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

                {form.watch("sessionTypeSelection") === 'onceOff' && (
                  <FormField
                    control={form.control}
                    name="paymentStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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

                <FormField
                  control={form.control}
                  name="session_pack_id"
                  render={({ field }) => {
                    const sessionTypeSelection = form.watch("sessionTypeSelection");
                    const combinedPacksAndSubscriptions = [
                      ...(activeSessionPacks || []).map(pack => ({
                        type: 'pack',
                        id: pack.id,
                        label: `Pack: ${pack.service_types?.name || 'Unknown Pack'} (${pack.sessions_remaining} remaining)`,
                        service_type_id: pack.service_type_id
                      })),
                      ...(activeClientSubscriptions || []).map(sub => ({
                        type: 'subscription',
                        id: sub.id,
                        label: `Subscription: ${sub.billing_cycle.charAt(0).toUpperCase() + sub.billing_cycle.slice(1)} - (${format(new Date(sub.start_date), 'MMM yy')})`,
                      })),
                    ];
                    console.log("DEBUG: Generated combinedPacksAndSubscriptions:", combinedPacksAndSubscriptions);
                    
                    return (
                      <FormItem>
                        <FormLabel>Assign from Pack or Subscription</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            // Reset both packId and subscriptionId first
                            form.setValue("session_pack_id", undefined, { shouldValidate: true });
                            form.setValue("subscription_id", undefined, { shouldValidate: true });
                            form.setValue("service_type_id", undefined, { shouldValidate: true });

                            const selectedItem = combinedPacksAndSubscriptions.find(item => item.id === value);

                            if (selectedItem?.type === 'pack') {
                              form.setValue("session_pack_id", value, { shouldValidate: true });
                            } else if (selectedItem?.type === 'subscription') {
                              form.setValue("subscription_id", value, { shouldValidate: true });
                            }
                            console.log("DEBUG: Selected Pack/Subscription ID:", value, "Type:", selectedItem?.type);
                          }}
                          value={field.value || form.watch("subscription_id") || ""}
                          disabled={sessionTypeSelection === 'onceOff' || isLoadingPacks || isLoadingSubscriptions}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={
                                sessionTypeSelection === 'onceOff' 
                                  ? "Not available for once-off sessions" 
                                  : (isLoadingPacks || isLoadingSubscriptions)
                                    ? "Loading packs and subscriptions..." 
                                    : combinedPacksAndSubscriptions.length === 0 
                                      ? "No active packs or subscriptions available"
                                      : "Do not assign to pack/subscription"
                              } />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingPacks || isLoadingSubscriptions ? (
                              <SelectItem value="loading" disabled>Loading packs and subscriptions...</SelectItem>
                            ) : combinedPacksAndSubscriptions.length === 0 ? (
                              <SelectItem value="no-options" disabled>No active packs or subscriptions</SelectItem>
                            ) : (
                              combinedPacksAndSubscriptions.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.label}
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