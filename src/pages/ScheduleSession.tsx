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
  service_type_id: z.string().min(1, 'Please select a service type'),
  session_date: z.date({
    required_error: 'Please select a session date',
  }),
  session_time: z.string().min(1, 'Please select a session time'),
  status: z.enum(['scheduled', 'completed', 'cancelled_late', 'cancelled_early']),
  session_pack_id: z.string().uuid('Please select a session pack').optional().nullable(),
  notes: z.string().optional(),
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
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingServiceTypes, setIsLoadingServiceTypes] = useState(true);
  const [isLoadingPacks, setIsLoadingPacks] = useState(true);

  const form = useForm<SessionFormData>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      client_id: initialClientId || '',
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
        .select('id, total_sessions, sessions_remaining, service_types(name)')
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
      // Combine date and time into a proper timestamp
      const [hours, minutes] = data.session_time.split(':').map(Number);
      const sessionDateTime = new Date(data.session_date);
      sessionDateTime.setHours(hours, minutes, 0, 0);

      const sessionData = {
        trainer_id: user?.id,
        client_id: data.client_id,
        service_type_id: data.service_type_id,
        session_date: sessionDateTime.toISOString(),
        status: data.status,
        session_pack_id: data.session_pack_id === "none" ? null : data.session_pack_id || null,
        notes: data.notes || null,
      };

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

  // Watch for client changes to fetch session packs
  useEffect(() => {
    const clientId = form.watch('client_id');
    if (clientId) {
      fetchActiveSessionPacks(clientId);
    } else {
      setActiveSessionPacks([]);
      setIsLoadingPacks(false);
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
                  name="service_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingServiceTypes ? "Loading service types..." : "Select a service type"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {serviceTypes.length === 0 && !isLoadingServiceTypes ? (
                            <SelectItem value="no-service-types" disabled>No service types found</SelectItem>
                          ) : (
                            serviceTypes.map((serviceType) => (
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

                {activeSessionPacks.length > 0 && (
                  <FormField
                    control={form.control}
                    name="session_pack_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Session Pack (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "none"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingPacks ? "Loading packs..." : "Select a session pack (Optional)"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Do not assign to pack</SelectItem>
                            {activeSessionPacks.map((pack) => (
                              <SelectItem key={pack.id} value={pack.id}>
                                {pack.service_types?.name || 'Untitled Pack'} ({pack.sessions_remaining} remaining)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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