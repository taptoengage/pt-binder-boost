import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { Clock, CreditCard, Calendar, DollarSign, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function ClientDashboard() {
  const { client, signOut } = useAuth();
  const { toast } = useToast();
  
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [upcomingSession, setUpcomingSession] = useState<any | null>(null);
  const [clientPaymentStatus, setClientPaymentStatus] = useState<string>('');
  const [clientPayments, setClientPayments] = useState<any[]>([]);
  const [clientSessions, setClientSessions] = useState<any[]>([]);

  useEffect(() => {
    if (client?.id && client?.trainer_id) {
      fetchClientDashboardData();
    }
  }, [client]);

  const fetchClientDashboardData = async () => {
    if (!client?.id || !client?.trainer_id) return;
    
    try {
      setIsLoadingDashboard(true);

      // Fetch upcoming session
      const { data: nextSession } = await supabase
        .from('sessions')
        .select('*, service_types(name)')
        .eq('client_id', client.id)
        .eq('trainer_id', client.trainer_id)
        .gte('session_date', new Date().toISOString())
        .eq('status', 'scheduled')
        .order('session_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      setUpcomingSession(nextSession);

      // Determine payment status
      const { data: recentPayment } = await supabase
        .from('payments')
        .select('due_date, status')
        .eq('client_id', client.id)
        .eq('trainer_id', client.trainer_id)
        .order('due_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentPayment) {
        const dueDate = new Date(recentPayment.due_date);
        const today = new Date();
        
        if (recentPayment.status === 'paid') {
          setClientPaymentStatus('Up to Date');
        } else if (recentPayment.status === 'pending' && dueDate < today) {
          setClientPaymentStatus('Overdue');
        } else if (recentPayment.status === 'pending') {
          setClientPaymentStatus(`Next Payment Due: ${format(dueDate, 'MMM dd, yyyy')}`);
        } else {
          setClientPaymentStatus('Payment Status Unknown');
        }
      } else {
        setClientPaymentStatus('No payment records');
      }

      // Fetch recent payments
      const { data: payments } = await supabase
        .from('payments')
        .select('*, service_types(name)')
        .eq('client_id', client.id)
        .eq('trainer_id', client.trainer_id)
        .order('due_date', { ascending: false })
        .limit(5);

      setClientPayments(payments || []);

      // Fetch upcoming sessions list
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*, service_types(name)')
        .eq('client_id', client.id)
        .eq('trainer_id', client.trainer_id)
        .gte('session_date', new Date().toISOString())
        .order('session_date', { ascending: true })
        .limit(5);

      setClientSessions(sessions || []);

    } catch (error) {
      console.error('Error fetching client dashboard data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  const getPaymentStatusColor = (status: string) => {
    if (status === 'paid') return 'text-green-600';
    if (status === 'pending') return 'text-yellow-600';
    if (status === 'overdue') return 'text-red-600';
    return 'text-muted-foreground';
  };

  if (isLoadingDashboard) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Welcome, {client?.name}!</h1>
            <p className="text-muted-foreground">Your Personal Training Dashboard</p>
          </div>
          <Button onClick={signOut} variant="outline">
            Sign Out
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Next Session</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {upcomingSession ? (
                <div>
                  <div className="text-2xl font-bold">
                    {format(new Date(upcomingSession.session_date), 'MMM dd')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {upcomingSession.service_types?.name} at {format(new Date(upcomingSession.session_date), 'h:mm a')}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-2xl font-bold">None scheduled</div>
                  <p className="text-xs text-muted-foreground">Contact your trainer</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sessions Remaining</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Coming Soon</div>
              <p className="text-xs text-muted-foreground">Contact your trainer for session balance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Payment Status</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clientPaymentStatus}</div>
              <p className="text-xs text-muted-foreground">Financial status</p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Sessions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>My Upcoming Sessions</CardTitle>
            <CardDescription>Your scheduled training sessions</CardDescription>
          </CardHeader>
          <CardContent>
            {clientSessions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        {format(new Date(session.session_date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        {format(new Date(session.session_date), 'h:mm a')}
                      </TableCell>
                      <TableCell>{session.service_types?.name}</TableCell>
                      <TableCell className="capitalize">{session.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground">No upcoming sessions scheduled.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle>My Recent Payments</CardTitle>
            <CardDescription>Your payment history</CardDescription>
          </CardHeader>
          <CardContent>
            {clientPayments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {format(new Date(payment.due_date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>{payment.service_types?.name}</TableCell>
                      <TableCell>${Number(payment.amount).toFixed(2)}</TableCell>
                      <TableCell className={`capitalize ${getPaymentStatusColor(payment.status)}`}>
                        {payment.status}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground">No payment records found.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}