
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Loader2, User, Phone, Mail, DollarSign, Calendar, Target, Activity, Plus, Clock } from 'lucide-react';
import { DashboardNavigation } from '@/components/Navigation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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
  };
}

interface ClientSession {
  id: string;
  session_date: string;
  status: string;
  notes: string | null;
  service_types: {
    name: string;
  };
}

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

        // Fetch client payments
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

        // Fetch client sessions
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('sessions')
          .select('*, service_types(name)')
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

  const handleBackToClients = () => {
    navigate('/clients');
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
            <h1 className="text-heading-1 mb-2">{client.name}</h1>
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
                onClick={() => navigate('/payments/new')}
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
                          {payment.service_types.name}
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
                onClick={() => navigate('/schedule/new')}
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
                          {session.service_types.name}
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Future Features Placeholder */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Custom Rates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                Custom service rates coming soon
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
