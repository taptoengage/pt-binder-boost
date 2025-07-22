
import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, User, Phone, Mail, DollarSign, Calendar, Target, Activity, Plus, Clock, Edit, Trash2, CalendarIcon, Package } from 'lucide-react';
import { DashboardNavigation } from '@/components/Navigation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Client {
  id: string;
  name: string;
  phone_number: string;
  email: string;
  default_session_rate: number;
  training_age?: number;
  rough_goals?: string;
  physical_activity_readiness?: string;
  created_at: string;
  updated_at: string;
}

interface ClientPayment {
  id: string;
  amount: number;
  due_date: string;
  date_paid: string | null;
  status: string;
  service_offerings: {
    service_types: {
      name: string;
    } | null;
  } | null;
}

interface ClientSession {
  id: string;
  session_date: string;
  status: string;
  notes: string | null;
  service_offerings: {
    service_types: {
      name: string;
    } | null;
  } | null;
}

interface ServiceType {
  id: string;
  name: string;
  description?: string;
}

const packSchema = z.object({
  service_type_id: z.string().min(1, 'Service type is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  cost_per_session: z.number().min(0.01, 'Cost per session must be greater than 0'),
  purchase_date: z.date({
    message: "Purchase date is required",
  }),
  expiry_date: z.date().optional(),
});

type PackFormData = z.infer<typeof packSchema>;

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clientPayments, setClientPayments] = useState<ClientPayment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [clientSessions, setClientSessions] = useState<ClientSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaymentConfirmModalOpen, setIsPaymentConfirmModalOpen] = useState(false);
  const [paymentToDeleteId, setPaymentToDeleteId] = useState<string | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);
  const [isSessionConfirmModalOpen, setIsSessionConfirmModalOpen] = useState(false);
  const [sessionToDeleteId, setSessionToDeleteId] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  
  // Add New Pack state and form
  const [isAddPackModalOpen, setIsAddPackModalOpen] = useState(false);
  const [isSubmittingPack, setIsSubmittingPack] = useState(false);
  const [coreServiceTypes, setCoreServiceTypes] = useState<ServiceType[]>([]);
  const [isLoadingServiceTypes, setIsLoadingServiceTypes] = useState(false);

  const packForm = useForm<PackFormData>({
    resolver: zodResolver(packSchema),
    defaultValues: {
      service_type_id: '',
      quantity: 1,
      cost_per_session: 0,
      purchase_date: new Date(),
      expiry_date: undefined,
    },
  });

  // Fetch core service types for pack form
  useEffect(() => {
    const fetchServiceTypes = async () => {
      if (!user) return;

      try {
        setIsLoadingServiceTypes(true);
        const { data, error } = await supabase
          .from('service_types')
          .select('id, name, description')
          .eq('trainer_id', user.id)
          .order('name');

        if (error) {
          throw error;
        }

        setCoreServiceTypes(data || []);
      } catch (error) {
        console.error('Error fetching service types:', error);
      } finally {
        setIsLoadingServiceTypes(false);
      }
    };

    fetchServiceTypes();
  }, [user?.id]);

  useEffect(() => {
    const fetchClientData = async () => {
      if (!user || !clientId) {
        setIsLoading(false);
        setIsLoadingPayments(false);
        setIsLoadingSessions(false);
        return;
      }

      try {
        setIsLoading(true);
        setIsLoadingPayments(true);
        setIsLoadingSessions(true);
        
        // Fetch client details
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .eq('id', clientId)
          .eq('trainer_id', user.id)
          .maybeSingle();

        if (clientError) {
          throw clientError;
        }

        if (!clientData) {
          toast({
            title: "Client not found",
            description: "The client you're looking for doesn't exist or you don't have permission to view it.",
            variant: "destructive",
          });
          navigate('/clients');
          return;
        }

        setClient(clientData);

        // Fetch client payments with service offerings
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('payments')
          .select('*, service_offerings(service_types(name))')
          .eq('client_id', clientId)
          .eq('trainer_id', user.id)
          .order('due_date', { ascending: false });

        if (paymentsError) {
          console.error('Error fetching payments:', paymentsError);
          toast({
            title: "Warning",
            description: "Failed to load payment history. Client details loaded successfully.",
            variant: "destructive",
          });
        } else {
          setClientPayments(paymentsData || []);
        }

        // Fetch client sessions with service offerings
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('sessions')
          .select('*, service_offerings(service_types(name))')
          .eq('client_id', clientId)
          .eq('trainer_id', user.id)
          .order('session_date', { ascending: false });

        if (sessionsError) {
          console.error('Error fetching sessions:', sessionsError);
          toast({
            title: "Warning",
            description: "Failed to load session history. Client details loaded successfully.",
            variant: "destructive",
          });
        } else {
          setClientSessions(sessionsData || []);
        }

      } catch (error) {
        console.error('Error fetching client data:', error);
        toast({
          title: "Error",
          description: "Failed to load client details. Please try again.",
          variant: "destructive",
        });
        navigate('/clients');
      } finally {
        setIsLoading(false);
        setIsLoadingPayments(false);
        setIsLoadingSessions(false);
      }
    };

    fetchClientData();
  }, [clientId, user?.id, toast, navigate]);

  // Calculate total pack value
  const totalPackValue = useMemo(() => {
    const quantity = packForm.watch('quantity') || 0;
    const costPerSession = packForm.watch('cost_per_session') || 0;
    return quantity * costPerSession;
  }, [packForm.watch('quantity'), packForm.watch('cost_per_session')]);

  const handleBackToClients = () => {
    navigate('/clients');
  };

  const handleEditClient = () => {
    navigate(`/clients/${clientId}/edit`);
  };

  const handleDeleteClient = async () => {
    if (!user || !clientId) return;

    try {
      setIsDeleting(true);
      
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId)
        .eq('trainer_id', user.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Client deleted",
        description: "The client and all associated data have been deleted successfully.",
      });

      navigate('/clients');
    } catch (error) {
      console.error('Error deleting client:', error);
      toast({
        title: "Error",
        description: "Failed to delete client. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsConfirmModalOpen(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!user || !clientId || !paymentToDeleteId) return;

    try {
      setIsDeletingPayment(true);
      
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentToDeleteId)
        .eq('client_id', clientId)
        .eq('trainer_id', user.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Payment deleted",
        description: "The payment record has been deleted successfully.",
      });

      // Refresh the payments list
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*, service_offerings(service_types(name))')
        .eq('client_id', clientId)
        .eq('trainer_id', user.id)
        .order('due_date', { ascending: false });

      if (!paymentsError) {
        setClientPayments(paymentsData || []);
      }

    } catch (error) {
      console.error('Error deleting payment:', error);
      toast({
        title: "Error",
        description: "Failed to delete payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingPayment(false);
      setIsPaymentConfirmModalOpen(false);
      setPaymentToDeleteId(null);
    }
  };

  const handleDeleteSession = async () => {
    if (!user || !clientId || !sessionToDeleteId) return;

    try {
      setIsDeletingSession(true);
      
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionToDeleteId)
        .eq('client_id', clientId)
        .eq('trainer_id', user.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Session deleted",
        description: "The session record has been deleted successfully.",
      });

      // Refresh the sessions list
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*, service_offerings(service_types(name))')
        .eq('client_id', clientId)
        .eq('trainer_id', user.id)
        .order('session_date', { ascending: false });

      if (!sessionsError) {
        setClientSessions(sessionsData || []);
      }

    } catch (error) {
      console.error('Error deleting session:', error);
      toast({
        title: "Error",
        description: "Failed to delete session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingSession(false);
      setIsSessionConfirmModalOpen(false);
      setSessionToDeleteId(null);
    }
  };

  const handleAddPackSubmit = async (data: PackFormData) => {
    console.log("DEBUG: Add Pack onSubmit triggered!");
    console.log("DEBUG: Pack form data:", data);
    
    if (!user?.id) {
      console.error("DEBUG: onAddPackSubmit: User not authenticated, cannot submit.");
      toast({ title: "Error", description: "You must be logged in to add a pack.", variant: "destructive" });
      return;
    }
    console.log("DEBUG: onAddPackSubmit: User authenticated. Proceeding with inserts.");

    if (!clientId) return;

    try {
      setIsSubmittingPack(true);
      
      // Robust type check for purchase_date
      const purchaseDate = data.purchase_date instanceof Date
        ? data.purchase_date
        : new Date(); // Fallback to current date if not a valid Date object
      
      // Robust type check for expiry_date
      const expiryDateIso = data.expiry_date instanceof Date
        ? data.expiry_date.toISOString().split('T')[0]
        : null; // Ensure this handles undefined/null by converting to null
      
      // First, insert the payment record
      console.log("DEBUG: onAddPackSubmit: Attempting payments insert with data:", {
        trainer_id: user.id,
        client_id: clientId,
        service_type_id: data.service_type_id,
        amount: totalPackValue,
        due_date: purchaseDate.toISOString().split('T')[0],
        status: 'paid',
        date_paid: purchaseDate.toISOString().split('T')[0],
      });

      const { data: paymentResult, error: paymentError } = await supabase
        .from('payments')
        .insert({
          trainer_id: user.id,
          client_id: clientId,
          service_type_id: data.service_type_id,
          amount: totalPackValue,
          due_date: purchaseDate.toISOString().split('T')[0],
          status: 'paid',
          date_paid: purchaseDate.toISOString().split('T')[0],
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      const newPaymentId = paymentResult.id;
      console.log("DEBUG: onAddPackSubmit: Payment inserted. New Payment ID:", newPaymentId);

      // Then, insert the session pack record
      console.log("DEBUG: onAddPackSubmit: Attempting session_packs insert with data:", {
        trainer_id: user.id,
        client_id: clientId,
        service_type_id: data.service_type_id,
        total_sessions: data.quantity,
        sessions_remaining: data.quantity,
        amount_paid: totalPackValue,
        payment_id: newPaymentId,
        purchase_date: purchaseDate.toISOString(),
        expiry_date: expiryDateIso,
        status: 'active',
      });

      const { error: sessionPackError } = await supabase
        .from('session_packs')
        .insert({
          trainer_id: user.id,
          client_id: clientId,
          service_type_id: data.service_type_id,
          total_sessions: data.quantity,
          sessions_remaining: data.quantity,
          amount_paid: totalPackValue,
          payment_id: newPaymentId,
          purchase_date: purchaseDate.toISOString(),
          expiry_date: expiryDateIso,
          status: 'active',
        });

      if (sessionPackError) throw sessionPackError;

      toast({
        title: "Success",
        description: "Session pack created successfully!",
      });

      // Reset form and close modal
      packForm.reset();
      setIsAddPackModalOpen(false);
      
      // Refresh the payments list to show the new payment
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*, service_offerings(service_types(name))')
        .eq('client_id', clientId)
        .eq('trainer_id', user.id)
        .order('due_date', { ascending: false });

      if (!paymentsError) {
        setClientPayments(paymentsData || []);
      }
      
    } catch (error) {
      console.error('DEBUG: onAddPackSubmit: Full error during pack creation:', error);
      toast({
        title: "Error",
        description: "Failed to create session pack. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingPack(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNavigation />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading client details...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!client) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Button 
              variant="ghost" 
              onClick={handleBackToClients}
              className="mb-4 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Clients
            </Button>
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-heading-1">{client.name}</h1>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleEditClient}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Client
                </Button>
                <Button 
                  onClick={() => setIsConfirmModalOpen(true)}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Client
                </Button>
              </div>
            </div>
            <p className="text-muted-foreground">Client Profile</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Basic Information */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone Number</p>
                    <p className="font-medium">{client.phone_number}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{client.email}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Default Session Rate</p>
                    <p className="font-medium">${client.default_session_rate.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Training Age</p>
                    <p className="font-medium">
                      {client.training_age ? `${client.training_age} years` : 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <div className="flex items-start space-x-3">
                  <Target className="w-4 h-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">Goals</p>
                    <p className="font-medium">
                      {client.rough_goals || 'No goals specified'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <div className="flex items-start space-x-3">
                  <Activity className="w-4 h-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">Physical Activity Readiness</p>
                    <p className="font-medium">
                      {client.physical_activity_readiness || 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Client Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Client Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Added on</p>
                <p className="font-medium">{new Date(client.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last updated</p>
                <p className="font-medium">{new Date(client.updated_at).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment History */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <DollarSign className="w-5 h-5 mr-2" />
                Payment History
              </CardTitle>
              <Button 
                onClick={() => navigate(`/payments/new?clientId=${clientId}`)}
                size="sm"
                className="flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Record Payment</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingPayments ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading payment history...</span>
              </div>
            ) : clientPayments.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No payment history for this client yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Amount</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Date Paid</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Service Type</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">
                            ${payment.amount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {new Date(payment.due_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {payment.date_paid 
                              ? new Date(payment.date_paid).toLocaleDateString() 
                              : 'N/A'
                            }
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              payment.status === 'paid' 
                                ? 'bg-green-100 text-green-800' 
                                : payment.status === 'overdue'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {payment.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            {payment.service_offerings?.service_types?.name || 'Unknown Service'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/clients/${clientId}/payments/${payment.id}/edit`)}
                                className="p-2"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setPaymentToDeleteId(payment.id);
                                  setIsPaymentConfirmModalOpen(true);
                                }}
                                className="p-2 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session History */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <Clock className="w-5 h-5 mr-2" />
                Session History
              </CardTitle>
              <Button 
                onClick={() => navigate(`/schedule/new?clientId=${clientId}`)}
                size="sm"
                className="flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Schedule New Session</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingSessions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading session history...</span>
              </div>
            ) : clientSessions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No session history for this client yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Service Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientSessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell className="font-medium">
                          {new Date(session.session_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {new Date(session.session_date).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </TableCell>
                        <TableCell>
                          {session.service_offerings?.service_types?.name || 'Unknown Service'}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            session.status === 'completed' 
                              ? 'bg-green-100 text-green-800' 
                              : session.status === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {session.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {session.notes || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/clients/${clientId}/sessions/${session.id}/edit`)}
                              className="p-2"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSessionToDeleteId(session.id);
                                setIsSessionConfirmModalOpen(true);
                              }}
                              className="p-2 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Offerings */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <Package className="w-5 h-5 mr-2" />
                Client Offerings
              </CardTitle>
              <Button 
                onClick={() => setIsAddPackModalOpen(true)}
                size="sm"
                className="flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Pack</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center py-8">
              Session packs and subscriptions coming soon
            </p>
          </CardContent>
        </Card>

        {/* Delete Confirmation Modal */}
        <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{client?.name}</strong>? This action cannot be undone. 
                All associated payments and sessions will also be deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteClient}
                disabled={isDeleting}
                className="flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment Delete Confirmation Modal */}
        <Dialog open={isPaymentConfirmModalOpen} onOpenChange={setIsPaymentConfirmModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Payment Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this payment record? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsPaymentConfirmModalOpen(false);
                  setPaymentToDeleteId(null);
                }}
                disabled={isDeletingPayment}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeletePayment}
                disabled={isDeletingPayment}
                className="flex items-center gap-2"
              >
                {isDeletingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Session Delete Confirmation Modal */}
        <Dialog open={isSessionConfirmModalOpen} onOpenChange={setIsSessionConfirmModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Session Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this session record? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsSessionConfirmModalOpen(false);
                  setSessionToDeleteId(null);
                }}
                disabled={isDeletingSession}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteSession}
                disabled={isDeletingSession}
                className="flex items-center gap-2"
              >
                {isDeletingSession ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add New Pack Modal */}
        <Dialog open={isAddPackModalOpen} onOpenChange={setIsAddPackModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Session Pack for {client?.name}</DialogTitle>
              <DialogDescription>
                Create a pre-paid pack of sessions for this client.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...packForm}>
              <form onSubmit={packForm.handleSubmit(handleAddPackSubmit)} className="space-y-6">
                {/* Core Service Type */}
                <FormField
                  control={packForm.control}
                  name="service_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Core Service Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a service type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingServiceTypes ? (
                            <div className="flex items-center justify-center py-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="ml-2 text-sm">Loading...</span>
                            </div>
                          ) : coreServiceTypes.length === 0 ? (
                            <div className="py-2 px-3 text-sm text-muted-foreground">
                              No service types found
                            </div>
                          ) : (
                            coreServiceTypes.map((serviceType) => (
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

                {/* Quantity of Sessions */}
                <FormField
                  control={packForm.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity of Sessions in Pack *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="e.g., 10"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Cost per Session */}
                <FormField
                  control={packForm.control}
                  name="cost_per_session"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Per Session in Pack *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="e.g., 75.00"
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

                {/* Total Pack Value (Display Only) */}
                <div className="p-4 bg-muted rounded-lg">
                  <Label className="text-sm font-medium">Total Pack Value</Label>
                  <p className="text-2xl font-bold text-primary">
                    ${totalPackValue.toFixed(2)}
                  </p>
                </div>

                {/* Purchase Date */}
                <FormField
                  control={packForm.control}
                  name="purchase_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Purchase Date</FormLabel>
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
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Expiry Date */}
                <FormField
                  control={packForm.control}
                  name="expiry_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Expiry Date (Optional)</FormLabel>
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
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < new Date()
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={() => setIsAddPackModalOpen(false)}
                    disabled={isSubmittingPack}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={isSubmittingPack}
                    className="flex items-center gap-2"
                  >
                    {isSubmittingPack ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding Pack...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Add Pack
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
