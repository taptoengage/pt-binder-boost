import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, ArrowLeft, Loader2 } from 'lucide-react';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const paymentSchema = z.object({
  client_id: z.string().uuid('Please select a client'),
  service_type_id: z.string().optional(),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  due_date: z.date({
    message: 'Due date is required',
  }),
  date_paid: z.date().optional(),
  status: z.enum(['paid', 'due', 'overdue'], {
    message: 'Please select a status',
  }),
  // NEW: Payment For fields
  paymentForType: z.enum(['oneOff', 'pack', 'subscription'], { 
    message: 'Payment type is required.' 
  }),
  packId: z.string().optional().nullable(),
  subscriptionId: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.paymentForType === 'oneOff' && !data.service_type_id) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: 'Service type is required for one-off payment.', 
      path: ['service_type_id'] 
    });
  }
  if (data.paymentForType === 'pack' && !data.packId) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: 'Pack is required for pack payment.', 
      path: ['packId'] 
    });
  }
  if (data.paymentForType === 'subscription' && !data.subscriptionId) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: 'Subscription is required for subscription payment.', 
      path: ['subscriptionId'] 
    });
  }
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface Client {
  id: string;
  name: string;
}

interface ServiceType {
  id: string;
  name: string;
}

export default function EditPayment() {
  const { paymentId, clientId } = useParams<{ paymentId: string; clientId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [clients, setClients] = useState<Client[]>([]);
  const [coreServiceTypes, setCoreServiceTypes] = useState<ServiceType[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingCoreServiceTypes, setLoadingCoreServiceTypes] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // NEW: States for fetching active packs/subscriptions
  const [activeSessionPacks, setActiveSessionPacks] = useState<any[]>([]);
  const [activeClientSubscriptions, setActiveClientSubscriptions] = useState<any[]>([]);
  const [isLoadingPacks, setIsLoadingPacks] = useState(true);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(true);

  // Fetch existing payment details to pre-populate form
  const { data: currentPayment, isLoading: isLoadingCurrentPayment, error: currentPaymentError } = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: async () => {
      if (!paymentId || !user?.id) return null;
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          clients(name), 
          service_types(name)
        `)
        .eq('id', paymentId)
        .eq('trainer_id', user.id)
        .single();

      if (error) { 
        console.error("Error fetching payment for edit:", error); 
        throw error; 
      }
      return data;
    },
    enabled: !!paymentId && !!user?.id,
  });

  // Determine initial paymentForType based on fetched data
  const initialPaymentForType = useMemo(() => {
    if ((currentPayment as any)?.session_pack_id) return 'pack';
    if ((currentPayment as any)?.client_subscription_id) return 'subscription';
    return 'oneOff';
  }, [currentPayment]);

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      client_id: '',
      amount: 0,
      status: 'due',
      paymentForType: 'oneOff',
      packId: null,
      subscriptionId: null,
      service_type_id: '',
    },
  });

  const { watch, setValue } = form;
  const datePaid = watch('date_paid');
  const dueDate = watch('due_date');
  
  // Watch client_id and paymentForType for fetching related data
  const watchedClientId = watch('client_id');
  const watchedPaymentForType = watch('paymentForType');

  // Update form when currentPayment is loaded
  useEffect(() => {
    if (currentPayment) {
      form.reset({
        client_id: currentPayment.client_id,
        amount: currentPayment.amount,
        due_date: new Date(currentPayment.due_date),
        date_paid: currentPayment.date_paid ? new Date(currentPayment.date_paid) : undefined,
        status: currentPayment.status as 'paid' | 'due' | 'overdue',
        service_type_id: currentPayment.service_type_id || '',
        paymentForType: initialPaymentForType,
        packId: (currentPayment as any)?.session_pack_id || null,
        subscriptionId: (currentPayment as any)?.client_subscription_id || null,
      });
    }
  }, [currentPayment, initialPaymentForType, form]);

  // Auto-update status based on date_paid
  useEffect(() => {
    if (datePaid) {
      setValue('status', 'paid');
    } else if (dueDate && dueDate < new Date()) {
      setValue('status', 'overdue');
    } else {
      setValue('status', 'due');
    }
  }, [datePaid, dueDate, setValue]);

  // Fetch clients
  useEffect(() => {
    const fetchClients = async () => {
      if (!user?.id) return;
      
      setLoadingClients(true);
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('id, name')
          .eq('trainer_id', user.id)
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
        setLoadingClients(false);
      }
    };

    fetchClients();
  }, [user?.id, toast]);

  // Fetch core service types
  useEffect(() => {
    const fetchCoreServiceTypes = async () => {
      if (!user?.id) return;
      
      setLoadingCoreServiceTypes(true);
      try {
        const { data, error } = await supabase
          .from('service_types')
          .select('id, name')
          .eq('trainer_id', user.id)
          .order('name');

        if (error) throw error;
        setCoreServiceTypes(data || []);
      } catch (error) {
        console.error('Error fetching service types:', error);
        toast({
          title: 'Error',
          description: 'Failed to load service types. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoadingCoreServiceTypes(false);
      }
    };

    fetchCoreServiceTypes();
  }, [user?.id, toast]);

  // Fetch active packs for selected client
  useEffect(() => {
    const fetchActivePacks = async () => {
      if (!watchedClientId || !user?.id) {
        setActiveSessionPacks([]);
        setIsLoadingPacks(false);
        return;
      }
      try {
        setIsLoadingPacks(true);
        const { data, error } = await supabase
          .from('session_packs')
          .select(`id, service_type_id, service_types(name), sessions_remaining`)
          .eq('client_id', watchedClientId)
          .eq('trainer_id', user.id)
          .eq('status', 'active')
          .gt('sessions_remaining', 0);

        if (error) throw error;
        setActiveSessionPacks(data || []);
      } catch (error) {
        console.error("Error fetching active packs for payment form:", error);
        toast({ 
          title: "Error", 
          description: "Failed to load client packs.", 
          variant: "destructive" 
        });
      } finally {
        setIsLoadingPacks(false);
      }
    };
    fetchActivePacks();
  }, [watchedClientId, user?.id, toast]);

  // Fetch active subscriptions for selected client
  useEffect(() => {
    const fetchActiveSubscriptions = async () => {
      if (!watchedClientId || !user?.id) {
        setActiveClientSubscriptions([]);
        setIsLoadingSubscriptions(false);
        return;
      }
      try {
        setIsLoadingSubscriptions(true);
        const { data, error } = await supabase
          .from('client_subscriptions')
          .select(`id, billing_cycle, start_date, subscription_service_allocations(service_type_id, service_types(name))`)
          .eq('client_id', watchedClientId)
          .eq('trainer_id', user.id)
          .in('status', ['active', 'paused']);

        if (error) throw error;
        setActiveClientSubscriptions(data || []);
      } catch (error) {
        console.error("Error fetching active subscriptions for payment form:", error);
        toast({ 
          title: "Error", 
          description: "Failed to load client subscriptions.", 
          variant: "destructive" 
        });
      } finally {
        setIsLoadingSubscriptions(false);
      }
    };
    fetchActiveSubscriptions();
  }, [watchedClientId, user?.id, toast]);

  // Reset pack/subscription/serviceType fields when paymentForType or client changes
  useEffect(() => {
    form.setValue('packId', null);
    form.setValue('subscriptionId', null);
    form.setValue('service_type_id', '');
  }, [watchedPaymentForType, watchedClientId, form]);

  const onSubmit = async (data: PaymentFormData) => {
    if (!user?.id || !paymentId) {
      toast({
        title: 'Error',
        description: 'Payment ID or user missing.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Calculate status based on business logic
      let finalStatus = data.status;
      if (data.date_paid) {
        finalStatus = 'paid';
      } else if (data.due_date < new Date()) {
        finalStatus = 'overdue';
      } else {
        finalStatus = 'due';
      }

      // Determine service_type_id based on payment type selected
      let finalServiceTypeId = data.service_type_id;

      if (data.paymentForType === 'pack' && data.packId) {
        const selectedPack = activeSessionPacks.find(p => p.id === data.packId);
        if (selectedPack) finalServiceTypeId = selectedPack.service_type_id;
      } else if (data.paymentForType === 'subscription' && data.subscriptionId) {
        const selectedSub = activeClientSubscriptions.find(s => s.id === data.subscriptionId);
        if (selectedSub && selectedSub.subscription_service_allocations?.length > 0) {
            finalServiceTypeId = selectedSub.subscription_service_allocations[0].service_type_id;
        }
      }

      if (!finalServiceTypeId) {
        toast({ 
          title: "Validation Error", 
          description: "Could not determine service type for payment.", 
          variant: "destructive" 
        });
        return;
      }

      const payload = {
        amount: data.amount,
        due_date: format(data.due_date, 'yyyy-MM-dd'),
        date_paid: data.date_paid ? format(data.date_paid, 'yyyy-MM-dd') : null,
        status: finalStatus,
        service_type_id: finalServiceTypeId,
        session_pack_id: data.paymentForType === 'pack' ? data.packId : null,
        client_subscription_id: data.paymentForType === 'subscription' ? data.subscriptionId : null,
      };

      const { error } = await supabase
        .from('payments')
        .update(payload)
        .eq('id', paymentId)
        .eq('trainer_id', user.id);

      if (error) throw error;

      toast({
        title: "Payment Updated",
        description: "The payment has been successfully updated!",
      });

      navigate(`/clients/${data.client_id}`);
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['payment', paymentId] });
      queryClient.invalidateQueries({ queryKey: ['trainerPayments', user.id] });
      queryClient.invalidateQueries({ queryKey: ['clientPayments', watchedClientId] });
      queryClient.invalidateQueries({ queryKey: ['sessionPacks'] });
      queryClient.invalidateQueries({ queryKey: ['activeClientSubscriptions'] });
    } catch (error: any) {
      console.error('Error updating payment:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to update payment. Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  // Render loading states for initial payment fetch
  if (isLoadingCurrentPayment) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading payment details...</span>
          </div>
        </div>
      </div>
    );
  }

  if (currentPaymentError || !currentPayment) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <p className="text-red-500">Error loading payment or payment not found.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="outline" onClick={handleBack} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return
          </Button>
          <h1 className="text-heading-1 mb-4">Edit Payment</h1>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Payment Details</CardTitle>
            <CardDescription>
              Editing payment for {currentPayment.clients?.name || 'Unknown Client'} (Service: {currentPayment.service_types?.name || 'N/A'}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Client Selection (Disabled in Edit) */}
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={true}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={currentPayment.clients?.name || "Select a client"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients.map(client => (
                            <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Payment For Type Select */}
                <FormField
                  control={form.control}
                  name="paymentForType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment For</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select payment type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="oneOff">One-Off Service</SelectItem>
                          <SelectItem value="pack">Session Pack</SelectItem>
                          <SelectItem value="subscription">Subscription</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Conditional Pack Select */}
                {watchedPaymentForType === 'pack' && (
                  <FormField
                    control={form.control}
                    name="packId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Pack</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''} disabled={!watchedClientId}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingPacks ? "Loading packs..." : "Select an active pack"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingPacks ? (
                              <SelectItem value="loading" disabled>Loading packs...</SelectItem>
                            ) : activeSessionPacks.length === 0 ? (
                              <SelectItem value="no-packs" disabled>No active packs found</SelectItem>
                            ) : (
                              activeSessionPacks.map(pack => (
                                <SelectItem key={pack.id} value={pack.id}>
                                  {pack.service_types?.name} ({pack.sessions_remaining} remaining)
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

                {/* Conditional Subscription Select */}
                {watchedPaymentForType === 'subscription' && (
                  <FormField
                    control={form.control}
                    name="subscriptionId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Subscription</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''} disabled={!watchedClientId}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingSubscriptions ? "Loading subscriptions..." : "Select an active subscription"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingSubscriptions ? (
                              <SelectItem value="loading" disabled>Loading subscriptions...</SelectItem>
                            ) : activeClientSubscriptions.length === 0 ? (
                              <SelectItem value="no-subs" disabled>No active subscriptions found</SelectItem>
                            ) : (
                              activeClientSubscriptions.map(sub => (
                                <SelectItem key={sub.id} value={sub.id}>
                                  {`${sub.billing_cycle.charAt(0).toUpperCase() + sub.billing_cycle.slice(1)} (${format(new Date(sub.start_date), 'MMM yy')})`}
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

                {/* Service Type (only for One-Off) */}
                {watchedPaymentForType === 'oneOff' && (
                  <FormField
                    control={form.control}
                    name="service_type_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={loadingCoreServiceTypes ? "Loading service types..." : "Select a service type"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {coreServiceTypes.length === 0 && !loadingCoreServiceTypes && (
                              <SelectItem value="no-service-types" disabled>
                                No service types found
                              </SelectItem>
                            )}
                            {coreServiceTypes.map((serviceType) => (
                              <SelectItem key={serviceType.id} value={serviceType.id}>
                                {serviceType.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Amount */}
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              className="pl-8"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Status */}
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
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="due">Due</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Status will auto-update based on payment date.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Due Date */}
                  <FormField
                    control={form.control}
                    name="due_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Due Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Date Paid */}
                  <FormField
                    control={form.control}
                    name="date_paid"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Date Paid (Optional)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              initialFocus
                            />
                            <div className="p-2">
                              <Button variant="ghost" onClick={() => field.onChange(null)} className="w-full">
                                Clear Date
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          Leave empty if payment hasn't been received yet.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting || !form.formState.isValid}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}