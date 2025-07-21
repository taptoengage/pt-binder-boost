import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { Clock, CreditCard, Calendar, DollarSign, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';

export default function ClientDashboard() {
  const { client, signOut } = useAuth();
  const { toast } = useToast();
  
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [upcomingSession, setUpcomingSession] = useState<any | null>(null);
  const [clientPaymentStatus, setClientPaymentStatus] = useState<string>('');
  const [clientPayments, setClientPayments] = useState<any[]>([]);
  const [clientSessions, setClientSessions] = useState<any[]>([]);
  const [clientSessionPacks, setClientSessionPacks] = useState<any[]>([]);
  const [isLoadingPacks, setIsLoadingPacks] = useState(true);

  useEffect(() => {
    if (client?.id && client?.trainer_id) {
      fetchClientDashboardData();
    }
  }, [client]);

  const fetchClientDashboardData = async () => {
    if (!client?.id || !client?.trainer_id) return;
    
    try {
      setIsLoadingDashboard(true);
      setIsLoadingPacks(true);

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

      if (nextSession) {
        console.log("DEBUG: Fetched next upcoming session data:", nextSession);
      }
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
        if (recentPayment.status === 'paid') {
          setClientPaymentStatus('Up to Date');
        } else if (recentPayment.status === 'overdue') {
          setClientPaymentStatus('Overdue');
        } else if (recentPayment.status === 'due') {
          setClientPaymentStatus(`Next Payment Due: ${format(new Date(recentPayment.due_date), 'MMM dd, yyyy')}`);
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
        .eq('status', 'scheduled')
        .order('session_date', { ascending: true })
        .limit(5);

      if (sessions) {
        console.log("DEBUG: Fetched client sessions data:", sessions);
      }
      setClientSessions(sessions || []);

      // Fetch client session packs
      const { data: sessionPacks, error: sessionPacksError } = await supabase
        .from('session_packs')
        .select('total_sessions, sessions_remaining, status, service_types(name)')
        .eq('client_id', client.id)
        .eq('trainer_id', client.trainer_id)
        .eq('status', 'active')
        .order('purchase_date', { ascending: false });

      if (sessionPacksError) {
        console.error('Error fetching session packs:', sessionPacksError);
        toast({
          title: "Error",
          description: "Failed to load session pack data. Please try again.",
          variant: "destructive",
        });
      } else {
        setClientSessionPacks(sessionPacks || []);
      }

    } catch (error) {
      console.error('Error fetching client dashboard data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDashboard(false);
      setIsLoadingPacks(false);
    }
  };

  const getPaymentStatusColor = (status: string) => {
    if (status === 'paid') return 'text-green-600';
    if (status === 'due') return 'text-yellow-600';
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
              {isLoadingPacks ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : clientSessionPacks.length === 0 ? (
                <div>
                  <div className="text-2xl font-bold">No Active Packs</div>
                  <p className="text-xs text-muted-foreground">Contact your trainer to purchase a pack</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const totalSumRemaining = clientSessionPacks.reduce((sum, pack) => sum + pack.sessions_remaining, 0);
                    const totalSumTotal = clientSessionPacks.reduce((sum, pack) => sum + pack.total_sessions, 0);
                    const percentageRemaining = totalSumTotal > 0 ? (totalSumRemaining / totalSumTotal) * 100 : 0;
                    
                    return (
                      <>
                        <div className="text-2xl font-bold">{totalSumRemaining} / {totalSumTotal}</div>
                        <div className="space-y-2">
                          <Progress value={percentageRemaining} className="h-2" />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{Math.round(percentageRemaining)}% remaining</span>
                            <span>{clientSessionPacks.length} active pack{clientSessionPacks.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
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