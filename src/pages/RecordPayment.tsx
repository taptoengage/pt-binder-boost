import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, ArrowLeft } from 'lucide-react';
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

const paymentSchema = z.object({
  client_id: z.string().uuid('Please select a client'),
  service_type_id: z.string().uuid('Please select a service type'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  due_date: z.date({
    required_error: 'Due date is required',
  }),
  date_paid: z.date().optional(),
  status: z.enum(['paid', 'due', 'overdue'], {
    required_error: 'Please select a status',
  }),
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

export default function RecordPayment() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get('clientId');
  const [clients, setClients] = useState<Client[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(true);

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      client_id: initialClientId || '',
      amount: 0,
      status: 'due',
    },
  });

  const { watch, setValue } = form;
  const datePaid = watch('date_paid');
  const dueDate = watch('due_date');

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

  // Fetch service types
  useEffect(() => {
    const fetchServiceTypes = async () => {
      if (!user?.id) return;
      
      setLoadingServiceTypes(true);
      try {
        const { data, error } = await supabase
          .from('service_types')
          .select('id, name')
          .eq('trainer_id', user.id)
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
        setLoadingServiceTypes(false);
      }
    };

    fetchServiceTypes();
  }, [user?.id, toast]);

  // Set form value when clients load and initialClientId exists
  useEffect(() => {
    if (initialClientId && clients.length > 0) {
      form.setValue('client_id', initialClientId);
    }
  }, [initialClientId, clients, form]);

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

      const { error } = await supabase
        .from('payments')
        .insert({
          trainer_id: user.id,
          client_id: data.client_id,
          service_type_id: data.service_type_id,
          amount: data.amount,
          due_date: data.due_date.toISOString().split('T')[0], // Format as YYYY-MM-DD
          date_paid: data.date_paid ? data.date_paid.toISOString().split('T')[0] : null,
          status: finalStatus,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Payment recorded successfully!',
      });

      form.reset();
    } catch (error) {
      console.error('Error recording payment:', error);
      toast({
        title: 'Error',
        description: 'Failed to record payment. Please try again.',
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                  {/* Service Type Selection */}
                  <FormField
                    control={form.control}
                    name="service_type_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={loadingServiceTypes ? "Loading service types..." : "Select a service type"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {serviceTypes.length === 0 && !loadingServiceTypes && (
                              <SelectItem value="no-service-types" disabled>
                                No service types found
                              </SelectItem>
                            )}
                            {serviceTypes.map((serviceType) => (
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
                    {form.formState.isSubmitting ? 'Recording...' : 'Record Payment'}
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