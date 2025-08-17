import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { Clock, CreditCard, Calendar, DollarSign, Loader2, User, Edit } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import UniversalSessionModal from '@/components/UniversalSessionModal';
import CancellationPenaltyModal from '@/components/CancellationPenaltyModal';
import ClientPackDetailModal from '@/components/ClientPackDetailModal';

export default function ClientDashboard() {
  const { client, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [upcomingSession, setUpcomingSession] = useState<any | null>(null);
  const [clientPaymentStatus, setClientPaymentStatus] = useState<string>('');
  const [clientPayments, setClientPayments] = useState<any[]>([]);
  const [clientSessions, setClientSessions] = useState<any[]>([]);
  const [clientSessionPacks, setClientSessionPacks] = useState<any[]>([]);
  const [isLoadingPacks, setIsLoadingPacks] = useState(true);
  const [scheduledSessionsCount, setScheduledSessionsCount] = useState(0);
  const [completedSessionsCount, setCompletedSessionsCount] = useState(0);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSessionForEdit, setSelectedSessionForEdit] = useState<any | null>(null);
  const [isCancellingId, setIsCancellingId] = useState<string | null>(null);
  const [isPenaltyCancelModalOpen, setIsPenaltyCancelModalOpen] = useState(false);
  const [selectedSessionForPenaltyCancel, setSelectedSessionForPenaltyCancel] = useState<any | null>(null);
  const [selectedSessionForRegularCancel, setSelectedSessionForRegularCancel] = useState<any | null>(null);
  const [isPackModalOpen, setIsPackModalOpen] = useState(false);
  const [selectedPackForModal, setSelectedPackForModal] = useState<any | null>(null);

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

      // Fetch client session packs with scheduled sessions count
      const { data: sessionPacks, error: sessionPacksError } = await supabase
        .from('session_packs')
        .select(`
          id,
          total_sessions, 
          sessions_remaining, 
          status, 
          service_types(name),
          amount_paid
        `)
        .eq('client_id', client.id)
        .eq('trainer_id', client.trainer_id)
        .eq('status', 'active')
        .order('purchase_date', { ascending: false });

      if (sessionPacks) {
        setClientSessionPacks(sessionPacks);
        
        // Get session counts for all active packs
        if (sessionPacks.length > 0) {
          const packIds = sessionPacks.map(pack => pack.id);
          
          const { data: sessionCounts } = await supabase
            .from('sessions')
            .select('status, cancellation_reason')
            .in('session_pack_id', packIds)
            .eq('client_id', client.id)
            .eq('trainer_id', client.trainer_id);
          
          if (sessionCounts) {
            const scheduled = sessionCounts.filter(s => s.status === 'scheduled').length;
            // Include penalty cancellations as consumed sessions
            const consumed = sessionCounts.filter(s => 
              s.status === 'completed' || 
              s.status === 'no-show' ||
              (s.status === 'cancelled' && s.cancellation_reason === 'penalty')
            ).length;
            
            setScheduledSessionsCount(scheduled);
            setCompletedSessionsCount(consumed);
          }
        } else {
          setScheduledSessionsCount(0);
          setCompletedSessionsCount(0);
        }
      }

      if (sessionPacksError) {
        console.error('Error fetching session packs:', sessionPacksError);
        toast({
          title: "Error",
          description: "Failed to load session pack data. Please try again.",
          variant: "destructive",
        });
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

  const isWithin24Hours = (sessionDate: Date) => {
    const now = new Date();
    const hoursUntilSession = (sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilSession <= 24;
  };

  const handleEditSession = (session: any) => {
    setSelectedSessionForEdit(session);
    setIsEditModalOpen(true);
  };

  const handleSessionUpdated = () => {
    fetchClientDashboardData();
  };

  const handlePenaltyCancelSession = (session: any) => {
    setSelectedSessionForPenaltyCancel(session);
    setIsPenaltyCancelModalOpen(true);
  };

  const handlePenaltyCancelComplete = () => {
    fetchClientDashboardData();
  };

  const handleConfirmNonPenaltyCancel = async (session: any) => {
    if (!session?.id) return;

    setIsCancellingId(session.id);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const { error } = await supabase.functions.invoke('cancel-client-session', {
        body: {
          sessionId: session.id,
          penalize: false,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        throw new Error(error.message || 'Failed to cancel session');
      }

      toast({
        title: "Session Cancelled",
        description: "Your session has been successfully cancelled and credit added back to your pack/subscription.",
      });
      fetchClientDashboardData();

    } catch (error: any) {
      console.error('Error cancelling session without penalty:', error);
      toast({
        title: "Error",
        description: `Failed to cancel session: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsCancellingId(null);
    }
  };

  const handlePackTileClick = () => {
    // Show the most recent pack for this view
    if (clientSessionPacks && clientSessionPacks.length > 0) {
      setSelectedPackForModal(clientSessionPacks[0]); // Selects the most recent pack
      setIsPackModalOpen(true);
    }
  };

  const handlePackModalClose = () => {
    setIsPackModalOpen(false);
    setSelectedPackForModal(null);
    // CRITICAL: Invalidate queries to force a data re-fetch on the dashboard
    fetchClientDashboardData();
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
            <h1 className="text-3xl font-bold">Welcome, {client ? `${client.first_name} ${client.last_name}`.trim() : 'Client'}!</h1>
            <p className="text-muted-foreground">Your Personal Training Dashboard</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{client ? `${client.first_name} ${client.last_name}`.trim() : 'Client'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/client/book-session')}>
                Book a Session
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/client/profile')}>
                My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                  <p className="text-xs text-muted-foreground">Time to book your next session!</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={handlePackTileClick}>
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
                    const totalSumTotal = clientSessionPacks.reduce((sum, pack) => sum + pack.total_sessions, 0);
                    // CRITICAL: New calculation for sessions available to book
                    const sessionsAvailableToBook = totalSumTotal - (scheduledSessionsCount + completedSessionsCount);
                    const percentageUsed = totalSumTotal > 0 ? ((scheduledSessionsCount + completedSessionsCount) / totalSumTotal) * 100 : 0;
                    const percentageRemaining = 100 - percentageUsed;
                    
                    return (
                      <>
                        <div className="text-2xl font-bold">{sessionsAvailableToBook} / {totalSumTotal}</div>
                        <div className="space-y-2">
                          <Progress value={percentageRemaining} className="h-2" />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{Math.round(percentageRemaining)}% remaining</span>
                            <span>{clientSessionPacks.length} active pack{clientSessionPacks.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mt-2">
                            <span>{scheduledSessionsCount} Scheduled</span>
                            <span>{completedSessionsCount} Completed</span>
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
              <TooltipProvider>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1">
                            {isWithin24Hours(new Date(session.session_date)) ? (
                              // Logic for sessions within 24 hours (penalty applies)
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" disabled>
                                      <Edit className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Cannot edit within 24 hours of session</p>
                                  </TooltipContent>
                                </Tooltip>
                                {/* This button triggers the penalty cancellation modal */}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handlePenaltyCancelSession(session)}
                                  className="text-destructive hover:text-destructive"
                                  disabled={isCancellingId === session.id}
                                >
                                  {isCancellingId === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel'}
                                </Button>
                              </>
                            ) : (
                              // Logic for sessions outside 24 hours (no penalty)
                              <>
                                <Button size="sm" variant="ghost" onClick={() => handleEditSession(session)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {/* This button triggers a standard confirmation dialog for non-penalty cancellation */}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      disabled={isCancellingId === session.id}
                                    >
                                      {isCancellingId === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel'}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Confirm Session Cancellation</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to cancel this session? This action will add the session credit back to your active pack or subscription.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Keep Session</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleConfirmNonPenaltyCancel(session)}>Confirm Cancellation</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TooltipProvider>
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
      
      <UniversalSessionModal
        mode="edit"
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        session={selectedSessionForEdit}
        onSessionUpdated={handleSessionUpdated}
      />
      
      <CancellationPenaltyModal
        isOpen={isPenaltyCancelModalOpen}
        onClose={() => setIsPenaltyCancelModalOpen(false)}
        session={selectedSessionForPenaltyCancel}
        onSessionCancelled={handlePenaltyCancelComplete}
      />
      
      <ClientPackDetailModal
        isOpen={isPackModalOpen}
        onClose={handlePackModalClose}
        pack={selectedPackForModal}
      />
    </div>
  );
}