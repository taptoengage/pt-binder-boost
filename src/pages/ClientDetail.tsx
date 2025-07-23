
import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, User, Phone, Mail, DollarSign, Calendar, Target, Activity, Plus, Clock, Edit, Trash2, CalendarIcon, Package } from 'lucide-react';
import { DashboardNavigation } from '@/components/Navigation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import ClientPackDetailModal from '@/components/ClientPackDetailModal';
import ClientSubscriptionModal from '@/components/ClientSubscriptionModal';

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
  service_types: {
    name: string;
  } | null;
}

interface ClientSession {
  id: string;
  session_date: string;
  status: string;
  notes: string | null;
  session_pack_id?: string | null;
  service_types: {
    name: string;
  } | null;
}

interface ServiceType {
  id: string;
  name: string;
  description?: string;
}

interface SessionPack {
  id: string;
  total_sessions: number;
  sessions_remaining: number;
  service_type_id: string;
  service_types: { name: string } | null;
  amount_paid: number;
  purchase_date: string;
  expiry_date: string | null;
  status: string;
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
  
  // Session packs state
  const [sessionPacks, setSessionPacks] = useState<SessionPack[]>([]);
  const [isLoadingSessionPacks, setIsLoadingSessionPacks] = useState(true);
  
  // Pack detail modal state
  const [isPackDetailModalOpen, setIsPackDetailModalOpen] = useState(false);
  const [selectedPackForDetail, setSelectedPackForDetail] = useState<SessionPack | null>(null);

  // Subscription modal state
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);

  // Pagination state for session history
  const [currentPage, setCurrentPage] = useState(1);
  const sessionsPerPage = 10;
  const [totalSessions, setTotalSessions] = useState(0);
  const totalPages = Math.ceil(totalSessions / sessionsPerPage);

  // Pagination handlers
  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
    console.log(`DEBUG: Navigating to previous page. New page: ${Math.max(currentPage - 1, 1)}`);
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
    console.log(`DEBUG: Navigating to next page. New page: ${Math.min(currentPage + 1, totalPages)}`);
  };

  // Filter state variables
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterServiceTypeId, setFilterServiceTypeId] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

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

  // Fetch active client subscriptions
  const { data: activeClientSubscriptions, isLoading: isLoadingActiveSubscriptions, error: activeSubscriptionsError } = useQuery({
    queryKey: ['activeClientSubscriptions', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('client_subscriptions')
        .select(`
          id,
          start_date,
          billing_cycle,
          payment_frequency,
          billing_amount,
          status,
          subscription_service_allocations!inner (
            quantity_per_period,
            period_type,
            cost_per_session,
            service_type_id
          )
        `)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('start_date', { ascending: false });

      if (error) {
        console.error("DEBUG: Error fetching active client subscriptions:", error.message);
        throw error;
      }
      console.log("DEBUG: Fetched active client subscriptions:", data);
      return data || [];
    },
    enabled: !!clientId,
  });

  // Fetch all service types for filter dropdown
  useEffect(() => {
    const fetchAllServiceTypes = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('service_types')
          .select('id, name')
          .eq('trainer_id', user.id)
          .order('name');

        if (error) {
          console.error('Error fetching service types for filter:', error);
          return;
        }

        // We'll use the existing coreServiceTypes state for the filter as well
        // since it's already being fetched
      } catch (error) {
        console.error('Error fetching service types for filter:', error);
      }
    };

    fetchAllServiceTypes();
  }, [user?.id]);

  useEffect(() => {
    const fetchClientData = async () => {
      if (!user || !clientId) {
        setIsLoading(false);
        setIsLoadingPayments(false);
        setIsLoadingSessions(false);
        setIsLoadingSessionPacks(false);
        return;
      }

      try {
        setIsLoading(true);
        setIsLoadingPayments(true);
        setIsLoadingSessions(true);
        setIsLoadingSessionPacks(true);
        
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

        // Fetch client payments with service types
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('payments')
          .select('*, service_types(name)')
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

        // Session fetching is now handled by a separate useEffect with pagination

        // Fetch client session packs with service types
        const { data: sessionPacksData, error: sessionPacksError } = await supabase
          .from('session_packs')
          .select(`
            id,
            total_sessions,
            sessions_remaining,
            service_type_id,
            amount_paid,
            purchase_date,
            expiry_date,
            status,
            service_types(name)
          `)
          .eq('client_id', clientId)
          .eq('trainer_id', user.id)
          .eq('status', 'active')
          .order('purchase_date', { ascending: false });

        if (sessionPacksError) {
          console.error('Error fetching session packs:', sessionPacksError);
          toast({
            title: "Warning",
            description: "Failed to load session packs. Client details loaded successfully.",
            variant: "destructive",
          });
        } else {
          setSessionPacks(sessionPacksData || []);
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
        setIsLoadingSessionPacks(false);
      }
    };

    fetchClientData();
  }, [clientId, user?.id, toast, navigate]);

  // Fetch sessions with pagination and filters
  useEffect(() => {
    const fetchSessionsWithPagination = async () => {
      if (!user || !clientId) {
        setIsLoadingSessions(false);
        return;
      }

      try {
        setIsLoadingSessions(true);
        
        const from = (currentPage - 1) * sessionsPerPage;
        const to = from + sessionsPerPage - 1;

        console.log(`DEBUG: Fetching sessions with filters - Page: ${currentPage}, Date: ${filterDate?.toDateString()}, ServiceType: ${filterServiceTypeId}, Status: ${filterStatus}`);

        let query = supabase
          .from('sessions')
          .select(
            `
            id,
            trainer_id,
            client_id,
            service_type_id,
            session_date,
            status,
            session_pack_id,
            notes,
            service_types(name)
            `,
            { count: 'exact' }
          )
          .eq('client_id', clientId)
          .eq('trainer_id', user.id);

        // Apply filters conditionally
        if (filterDate) {
          // Format date to 'YYYY-MM-DD' for Supabase date column filtering
          const formattedDate = format(filterDate, 'yyyy-MM-dd');
          query = query.gte('session_date', `${formattedDate}T00:00:00`)
                      .lt('session_date', `${formattedDate}T23:59:59`);
          console.log("DEBUG: Applying date filter:", formattedDate);
        }
        if (filterServiceTypeId) {
          query = query.eq('service_type_id', filterServiceTypeId);
          console.log("DEBUG: Applying service type filter:", filterServiceTypeId);
        }
        if (filterStatus) {
          query = query.eq('status', filterStatus);
          console.log("DEBUG: Applying status filter:", filterStatus);
        }

        query = query
          .order('session_date', { ascending: true })
          .range(from, to);

        const { data, error, count } = await query;

        if (error) {
          console.error("DEBUG: Error fetching filtered sessions:", error.message);
          throw error;
        }
        
        console.log(`DEBUG: Fetched filtered sessions:`, data);
        console.log(`DEBUG: Total filtered session count:`, count);
        
        setClientSessions(data || []);
        setTotalSessions(count || 0);

      } catch (error) {
        console.error('Error fetching sessions:', error);
        toast({
          title: "Warning",
          description: "Failed to load session history.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingSessions(false);
      }
    };

    fetchSessionsWithPagination();
  }, [clientId, user?.id, currentPage, filterDate, filterServiceTypeId, filterStatus, toast]);

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
        .select('*, service_types(name)')
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
        .select('*, service_types(name)')
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

  const handleViewPackDetail = (pack: SessionPack) => {
    setSelectedPackForDetail(pack);
    setIsPackDetailModalOpen(true);
    console.log("DEBUG: Opening pack detail modal for pack:", pack.id);
  };

  const handleAddPackSubmit = async (data: PackFormData) => {
    if (!user?.id) {
      toast({ title: "Error", description: "You must be logged in to add a pack.", variant: "destructive" });
      return;
    }

    if (!clientId) return;

    try {
      setIsSubmittingPack(true);
      
      // Robust date handling with validation
      const purchaseDateObj = data.purchase_date ? new Date(data.purchase_date) : new Date(); 
      if (isNaN(purchaseDateObj.getTime())) {
        throw new Error("Invalid purchase date provided.");
      }
      const purchaseDateForInsert = purchaseDateObj.toISOString().split('T')[0];

      const expiryDateObj = data.expiry_date; 
      const expiryDateForInsert = expiryDateObj instanceof Date && !isNaN(expiryDateObj.getTime())
        ? expiryDateObj.toISOString().split('T')[0]
        : null; 

      // First, insert the payment record
      const { data: paymentResult, error: paymentError } = await supabase
        .from('payments')
        .insert({
          trainer_id: user.id,
          client_id: clientId,
          service_type_id: data.service_type_id, // Now links directly to public.service_types.id
          amount: totalPackValue,
          due_date: purchaseDateForInsert,
          status: 'paid',
          date_paid: purchaseDateForInsert,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      const newPaymentId = paymentResult.id;

      // Then, insert the session pack record
      const { error: sessionPackError } = await supabase
        .from('session_packs')
        .insert({
          trainer_id: user.id,
          client_id: clientId,
          service_type_id: data.service_type_id, // Now links directly to public.service_types.id
          total_sessions: data.quantity,
          sessions_remaining: data.quantity,
          amount_paid: totalPackValue,
          payment_id: newPaymentId,
          purchase_date: purchaseDateForInsert,
          expiry_date: expiryDateForInsert,
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
        .select('*, service_types(name)')
        .eq('client_id', clientId)
        .eq('trainer_id', user.id)
        .order('due_date', { ascending: false });

      if (!paymentsError) {
        setClientPayments(paymentsData || []);
      }

      // Refresh the session packs list to show the new pack
      const { data: sessionPacksData, error: sessionPacksError } = await supabase
        .from('session_packs')
        .select(`
          id,
          total_sessions,
          sessions_remaining,
          service_type_id,
          amount_paid,
          purchase_date,
          expiry_date,
          status,
          service_types(name)
        `)
        .eq('client_id', clientId)
        .eq('trainer_id', user.id)
        .eq('status', 'active')
        .order('purchase_date', { ascending: false });

      if (!sessionPacksError) {
        setSessionPacks(sessionPacksData || []);
      }
      
    } catch (error) {
      console.error('Error during pack creation:', error);
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
                            {payment.service_types?.name || 'Unknown Service'}
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
            {/* Filter Controls */}
            <div className="flex flex-wrap items-end gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
              {/* Date Filter */}
              <div className="flex flex-col space-y-1">
                <label className="text-sm font-medium text-gray-700">Filter by Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-[180px] justify-start text-left font-normal",
                        !filterDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filterDate ? format(filterDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent
                      mode="single"
                      selected={filterDate}
                      onSelect={(date) => {
                        setFilterDate(date);
                        setCurrentPage(1);
                        console.log("DEBUG: Date filter set to:", date);
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Service Type Filter */}
              <div className="flex flex-col space-y-1">
                <label className="text-sm font-medium text-gray-700">Filter by Service Type</label>
                <Select
                  value={filterServiceTypeId || "all"}
                  onValueChange={(value) => {
                    setFilterServiceTypeId(value === "all" ? undefined : value);
                    setCurrentPage(1);
                    console.log("DEBUG: Service Type filter set to:", value);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Service Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Service Types</SelectItem>
                    {isLoadingServiceTypes ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      coreServiceTypes?.map((serviceType) => (
                        <SelectItem key={serviceType.id} value={serviceType.id}>
                          {serviceType.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div className="flex flex-col space-y-1">
                <label className="text-sm font-medium text-gray-700">Filter by Status</label>
                <Select
                  value={filterStatus || "all"}
                  onValueChange={(value) => {
                    setFilterStatus(value === "all" ? undefined : value);
                    setCurrentPage(1);
                    console.log("DEBUG: Status filter set to:", value);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters Button */}
              {(filterDate || filterServiceTypeId || filterStatus) && (
                <Button
                  onClick={() => {
                    setFilterDate(undefined);
                    setFilterServiceTypeId(undefined);
                    setFilterStatus(undefined);
                    setCurrentPage(1);
                    console.log("DEBUG: Filters cleared.");
                  }}
                  variant="secondary"
                >
                  Clear Filters
                </Button>
              )}
            </div>

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
                       <TableHead>Linked To</TableHead>
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
                          {session.service_types?.name || 'Unknown Service'}
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
                           {session.session_pack_id ? (
                             <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">
                               From Pack
                             </span>
                           ) : (
                             <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                               One-Off
                             </span>
                           )}
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
             {totalPages > 1 && (
               <div className="flex justify-end items-center space-x-2 mt-4">
                 <Button
                   onClick={handlePreviousPage}
                   disabled={currentPage === 1 || isLoadingSessions}
                   variant="outline"
                   size="sm"
                 >
                   Previous
                 </Button>
                 <span className="text-sm text-gray-700">
                   Page {currentPage} of {totalPages}
                 </span>
                 <Button
                   onClick={handleNextPage}
                   disabled={currentPage === totalPages || isLoadingSessions}
                   variant="outline"
                   size="sm"
                 >
                   Next
                 </Button>
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
                Active Packs & Subscriptions
              </CardTitle>
              <div className="flex space-x-2">
                <Button 
                  onClick={() => navigate(`/clients/${clientId}/pack-history`)}
                  variant="outline"
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <Clock className="w-4 h-4" />
                  <span>See Pack History</span>
                </Button>
                <Button 
                  onClick={() => setIsSubscriptionModalOpen(true)}
                  size="sm"
                  variant="outline"
                  className="flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Subscription</span>
                </Button>
                <Button 
                  onClick={() => setIsAddPackModalOpen(true)}
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Pack</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(isLoadingSessionPacks || isLoadingActiveSubscriptions) ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading session packs and subscriptions...</span>
              </div>
            ) : (sessionPacks.length === 0 && activeClientSubscriptions?.length === 0) ? (
              <p className="text-muted-foreground text-center py-8">
                No session packs or subscriptions for this client yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Display Active Packs */}
                {sessionPacks.map((pack) => {
                  const progressPercentage = ((pack.total_sessions - pack.sessions_remaining) / pack.total_sessions) * 100;
                  
                  return (
                    <Card
                      key={pack.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleViewPackDetail(pack)}
                    >
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">
                          {pack.service_types?.name || 'Unknown Service'} - {pack.total_sessions} Pack
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-muted-foreground">Sessions Progress</span>
                            <span className="text-sm font-medium">
                              {pack.sessions_remaining} / {pack.total_sessions} remaining
                            </span>
                          </div>
                          <Progress value={progressPercentage} className="h-2" />
                        </div>
                        
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Used:</span>
                          <span className="font-medium">{pack.total_sessions - pack.sessions_remaining} sessions</span>
                        </div>
                        
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Value:</span>
                          <span className="font-medium">${pack.amount_paid.toFixed(2)}</span>
                        </div>
                        
                        {pack.expiry_date && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Expires:</span>
                            <span className="font-medium">{format(new Date(pack.expiry_date), 'dd/MM/yyyy')}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Display Active Subscriptions */}
                {isLoadingActiveSubscriptions && <p>Loading active subscriptions...</p>}
                {activeSubscriptionsError && <p className="text-red-500">Error loading subscriptions: {activeSubscriptionsError.message}</p>}
                
                {activeClientSubscriptions?.length > 0 && (
                  <>
                    {activeClientSubscriptions.map((subscription) => (
                      <Card key={subscription.id} className="cursor-pointer hover:shadow-md transition-shadow">
                        <CardHeader>
                          <CardTitle>
                            Subscription - {subscription.billing_cycle.charAt(0).toUpperCase() + subscription.billing_cycle.slice(1)} ({format(new Date(subscription.start_date), 'MMM do, yyyy')})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-lg font-bold">
                            {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(subscription.billing_amount)} per {subscription.billing_cycle}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Paid {subscription.payment_frequency.charAt(0).toUpperCase() + subscription.payment_frequency.slice(1)}
                          </p>

                          {subscription.subscription_service_allocations && subscription.subscription_service_allocations.length > 0 && (
                            <div className="mt-3 text-sm">
                              <p className="font-semibold">Includes:</p>
                              <ul className="list-disc list-inside text-muted-foreground">
                                {subscription.subscription_service_allocations.map((alloc, idx) => {
                                  // Find service type name from coreServiceTypes
                                  const serviceType = coreServiceTypes.find(st => st.id === alloc.service_type_id);
                                  return (
                                    <li key={idx}>
                                      {alloc.quantity_per_period}x {serviceType?.name || 'Unknown Service'} ({alloc.period_type})
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </>
                )}
              </div>
            )}
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

        {/* Pack Detail Modal */}
        <ClientPackDetailModal
          isOpen={isPackDetailModalOpen}
          onClose={() => setIsPackDetailModalOpen(false)}
          pack={selectedPackForDetail}
        />

        {/* Subscription Modal */}
        <ClientSubscriptionModal
          isOpen={isSubscriptionModalOpen}
          onClose={() => setIsSubscriptionModalOpen(false)}
          clientId={clientId || ''}
        />
      </div>
    </div>
  );
}
