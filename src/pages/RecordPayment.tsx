import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';

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
  paymentForType: z.enum(['oneOff', 'pack', 'subscription'], { 
    message: 'Payment type is required.' 
  }),
  packId: z.string().optional().nullable(),
  subscriptionId: z.string().optional().nullable(),
  receipt_number: z.string().optional().nullable(),
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
  default_rate?: number;
}

export default function RecordPayment() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get('clientId');
  const [clients, setClients] = useState<Client[]>([]);
  const [coreServiceTypes, setCoreServiceTypes] = useState<ServiceType[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingCoreServiceTypes, setLoadingCoreServiceTypes] = useState(true);
  
  // States for fetching active packs/subscriptions
  const [activeSessionPacks, setActiveSessionPacks] = useState<any[]>([]);
  const [activeClientSubscriptions, setActiveClientSubscriptions] = useState<any[]>([]);
  const [isLoadingPacks, setIsLoadingPacks] = useState(true);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(true);

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      client_id: initialClientId || '',
      amount: 0,
      status: 'due',
      paymentForType: 'oneOff',
      packId: null,
      subscriptionId: null,
      service_type_id: '',
      receipt_number: null,
    },
  });

  const { watch, setValue } = form;
  const datePaid = watch('date_paid');
  const dueDate = watch('due_date');
  
  // Watch client_id and paymentForType for fetching related data
  const watchedClientId = watch('client_id');
  const watchedPaymentForType = watch('paymentForType');
  const watchedPackId = watch('packId');
  const watchedSubscriptionId = watch('subscriptionId');
  const watchedServiceTypeId = watch('service_type_id');

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

  // Fetch core service types (without default_rate for now)
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

  // Set form value when clients load and initialClientId exists
  useEffect(() => {
    if (initialClientId && clients.length > 0) {
      form.setValue('client_id', initialClientId);
    }
  }, [initialClientId, clients, form]);

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
          .select(`id, service_type_id, total_sessions, amount_paid, service_types(name), sessions_remaining`)
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
          .select(`id, billing_amount, billing_cycle, start_date, subscription_service_allocations(service_type_id, service_types(name))`)
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

  // Auto-populate amount based on selection
  useEffect(() => {
    let calculatedAmount = 0;
    if (watchedPaymentForType === 'pack' && watchedPackId) {
      const selectedPack = activeSessionPacks.find(p => p.id === watchedPackId);
      if (selectedPack && selectedPack.amount_paid) {
        calculatedAmount = selectedPack.amount_paid / selectedPack.total_sessions * selectedPack.sessions_remaining;
      }
    } else if (watchedPaymentForType === 'subscription' && watchedSubscriptionId) {
      const selectedSub = activeClientSubscriptions.find(s => s.id === watchedSubscriptionId);
      if (selectedSub && selectedSub.billing_amount) {
        calculatedAmount = selectedSub.billing_amount;
      }
    }
    if (calculatedAmount > 0) {
      setValue('amount', parseFloat(calculatedAmount.toFixed(2)));
    }
  }, [watchedPaymentForType, watchedPackId, watchedSubscriptionId, watchedServiceTypeId, activeSessionPacks, activeClientSubscriptions, coreServiceTypes, setValue]);

  const onSubmit = async (data: PaymentFormData) => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to record a payment.',
        variant: 'destructive',
      });
      return;
    }

    try {
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
        trainer_id: user.id,
        client_id: data.client_id,
        amount: data.amount,
        due_date: data.due_date.toISOString().split('T')[0],
        date_paid: data.date_paid ? data.date_paid.toISOString().split('T')[0] : null,
        status: finalStatus,
        service_type_id: finalServiceTypeId,
        session_pack_id: data.paymentForType === 'pack' ? data.packId : null,
        client_subscription_id: data.paymentForType === 'subscription' ? data.subscriptionId : null,
      };

      const { error } = await supabase
        .from('payments')
        .insert([payload]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Payment recorded successfully!',
      });

      form.reset();
      navigate(`/clients/${data.client_id}`);
      
      queryClient.invalidateQueries({ queryKey: ['trainerPayments', user.id] });
      queryClient.invalidateQueries({ queryKey: ['clientPayments', watchedClientId] });
      queryClient.invalidateQueries({ queryKey: ['sessionPacks'] });
      queryClient.invalidateQueries({ queryKey: ['activeClientSubscriptions'] });
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to record payment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

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
          
          <h1 className="text-heading-1 mb-4">Record New Payment</h1>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Payment Details</CardTitle>
            <CardDescription>
              Record a new payment for a client and service type.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Client Selection */}
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger disabled={!!initialClientId}>
                            <SelectValue placeholder={loadingClients ? "Loading clients..." : "Select a client"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients.length === 0 && !loadingClients && (
                            <SelectItem value="no-clients" disabled>
                              No clients found
                            </SelectItem>
                          )}
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
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

                {/* Receipt Number (read-only for new payments) */}
                <FormField
                  control={form.control}
                  name="receipt_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Receipt Number</FormLabel>
                      <FormControl>
                        <Input {...field} readOnly value={field.value || 'N/A (Generated on success)'} />
                      </FormControl>
                      <FormDescription>
                        A unique reference number generated upon successful payment.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Amount */}
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
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
                              initialFocus
                              className="p-3 pointer-events-auto"
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
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
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

                <div className="flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={form.formState.isSubmitting}
                    className="w-full md:w-auto"
                  >
                    {form.formState.isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Recording...
                      </>
                    ) : (
                      'Record Payment'
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}