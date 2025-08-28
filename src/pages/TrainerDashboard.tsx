import { useEffect, useState } from 'react';
import { DashboardNavigation } from '@/components/Navigation';
import { DashboardCard, MetricCard } from '@/components/DashboardCard';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import UniversalSessionModal from '@/components/UniversalSessionModal';
import {
  Users,
  Calendar,
  CreditCard,
  TrendingUp,
  Clock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

const TrainerDashboard = () => {
  // render-only guard: AuthGuard owns routing
  const { authStatus, user, trainer } = useAuth();
  if (authStatus !== 'trainer') return null;

  const { toast } = useToast();

  // Prefer trainers.id (schema), fall back to user.id for safety
  const trainerId = trainer?.id ?? user?.id ?? null;

  // State for dashboard data
  const [todaysSessions, setTodaysSessions] = useState<any[]>([]);
  const [overduePayments, setOverduePayments] = useState<any[]>([]);
  const [weeklyEarnings, setWeeklyEarnings] = useState<number | null>(null);
  const [sessionsThisWeek, setSessionsThisWeek] = useState<number | null>(null);
  const [activeClientsCount, setActiveClientsCount] = useState<number | null>(null);
  const [outstandingPaymentsTotal, setOutstandingPaymentsTotal] = useState<number | null>(null);
  const [weeklyEarningsChange, setWeeklyEarningsChange] = useState<number | null>(null);
  const [sessionsThisWeekChange, setSessionsThisWeekChange] = useState<number | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);

  // State for sessions running low feature
  const [lowSessionClients, setLowSessionClients] = useState<any[]>([]);
  const [isLoadingLowSessions, setIsLoadingLowSessions] = useState(true);

  // State for modal control
  const [isSessionDetailModalOpen, setIsSessionDetailModalOpen] = useState(false);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<any | null>(null);

  const fetchDashboardData = async () => {
    if (!trainerId) return;

    try {
      setIsLoadingDashboard(true);

      // Date ranges
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      // Start/end of current week (Mon–Sun)
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Today's sessions
      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('*, clients(first_name, last_name)')
        .eq('trainer_id', trainerId)
        .eq('status', 'scheduled')
        .gte('session_date', startOfToday.toISOString())
        .lte('session_date', endOfToday.toISOString())
        .order('session_date', { ascending: true });

      if (sessionsError) throw sessionsError;

      const formattedSessions =
        sessions?.map((session) => ({
          id: session.id,
          client: session.clients
            ? `${session.clients.first_name} ${session.clients.last_name}`.trim()
            : 'Unknown Client',
          time: new Date(session.session_date).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
          type: 'Training Session',
          status: session.status,
          session_date: session.session_date,
          trainer_id: session.trainer_id,
          notes: session.notes,
        })) ?? [];

      setTodaysSessions(formattedSessions);

      // Overdue payments
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('*, clients(first_name, last_name)')
        .eq('trainer_id', trainerId)
        .eq('status', 'overdue')
        .order('due_date', { ascending: true });

      if (paymentsError) throw paymentsError;

      const formattedPayments =
        payments?.map((payment) => {
          const daysOverdue = Math.floor(
            (now.getTime() - new Date(payment.due_date).getTime()) / (1000 * 60 * 60 * 24),
          );
          return {
            id: payment.id,
            client: payment.clients
              ? `${payment.clients.first_name} ${payment.clients.last_name}`.trim()
              : 'Unknown Client',
            amount: Number(payment.amount),
            daysOverdue: Math.max(0, daysOverdue),
          };
        }) ?? [];

      setOverduePayments(formattedPayments);

      // Weekly earnings
      const { data: weeklyPayments, error: weeklyEarningsError } = await supabase
        .from('payments')
        .select('amount')
        .eq('trainer_id', trainerId)
        .eq('status', 'paid')
        .gte('date_paid', startOfWeek.toISOString().split('T')[0])
        .lte('date_paid', endOfWeek.toISOString().split('T')[0]);

      if (weeklyEarningsError) throw weeklyEarningsError;

      const totalEarnings =
        weeklyPayments?.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
      setWeeklyEarnings(totalEarnings);

      // Sessions this week
      const { data: weeklySessions, error: weeklySessionsError } = await supabase
        .from('sessions')
        .select('id')
        .eq('trainer_id', trainerId)
        .eq('status', 'completed')
        .gte('session_date', startOfWeek.toISOString())
        .lte('session_date', endOfWeek.toISOString());

      if (weeklySessionsError) throw weeklySessionsError;
      setSessionsThisWeek(weeklySessions?.length ?? 0);

      // Active clients count
      const { count: clientsCount, error: clientsError } = await supabase
        .from('clients')
        .select('id', { count: 'exact' })
        .eq('trainer_id', trainerId);

      if (clientsError) throw clientsError;
      setActiveClientsCount(clientsCount ?? 0);

      // Outstanding payments total
      const { data: outstandingPayments, error: outstandingError } = await supabase
        .from('payments')
        .select('amount')
        .eq('trainer_id', trainerId)
        .eq('status', 'overdue');

      if (outstandingError) throw outstandingError;

      const totalOutstanding =
        outstandingPayments?.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
      setOutstandingPaymentsTotal(totalOutstanding);

      // Last week ranges for % change
      const startOfLastWeek = new Date(startOfWeek);
      startOfLastWeek.setDate(startOfWeek.getDate() - 7);
      const endOfLastWeek = new Date(endOfWeek);
      endOfLastWeek.setDate(endOfWeek.getDate() - 7);

      // Last week's earnings
      const { data: lastWeekPayments, error: lastWeekEarningsError } = await supabase
        .from('payments')
        .select('amount')
        .eq('trainer_id', trainerId)
        .eq('status', 'paid')
        .gte('date_paid', startOfLastWeek.toISOString().split('T')[0])
        .lte('date_paid', endOfLastWeek.toISOString().split('T')[0]);

      if (lastWeekEarningsError) throw lastWeekEarningsError;

      const previousWeekEarnings =
        lastWeekPayments?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;
      const earningsChange =
        previousWeekEarnings === 0
          ? totalEarnings > 0
            ? 100
            : 0
          : ((totalEarnings - previousWeekEarnings) / previousWeekEarnings) * 100;
      setWeeklyEarningsChange(earningsChange);

      // Last week's sessions
      const { data: lastWeekSessions, error: lastWeekSessionsError } = await supabase
        .from('sessions')
        .select('id')
        .eq('trainer_id', trainerId)
        .eq('status', 'completed')
        .gte('session_date', startOfLastWeek.toISOString())
        .lte('session_date', endOfLastWeek.toISOString());

      if (lastWeekSessionsError) throw lastWeekSessionsError;

      const previousWeekSessions = lastWeekSessions?.length ?? 0;
      const sessionsCount = weeklySessions?.length ?? 0;
      const sessionsChange =
        previousWeekSessions === 0
          ? sessionsCount > 0
            ? 100
            : 0
          : ((sessionsCount - previousWeekSessions) / previousWeekSessions) * 100;
      setSessionsThisWeekChange(sessionsChange);

      // Active packs → “running low” clients
      const { data: allActivePacks, error: allPacksError } = await supabase
        .from('session_packs')
        .select('*, clients(id, first_name, last_name, phone_number), service_types(name)')
        .eq('trainer_id', trainerId)
        .eq('status', 'active')
        .gt('sessions_remaining', 0);

      if (allPacksError) throw allPacksError;

      const clientPackSummaries = new Map<
        string,
        { id: string; first_name: string; last_name: string; phone_number: string; total_remaining: number; total_initial: number }
      >();

      (allActivePacks ?? []).forEach((pack) => {
        const clientId = pack.clients?.id || 'unknown';
        if (!clientPackSummaries.has(clientId)) {
          clientPackSummaries.set(clientId, {
            id: clientId,
            first_name: pack.clients?.first_name || 'Unknown',
            last_name: pack.clients?.last_name || 'Client',
            phone_number: pack.clients?.phone_number || 'N/A',
            total_remaining: 0,
            total_initial: 0,
          });
        }
        const summary = clientPackSummaries.get(clientId)!;
        summary.total_remaining += pack.sessions_remaining;
        summary.total_initial += pack.total_sessions;
      });

      const clientsByPackStatus = Array.from(clientPackSummaries.values())
        .filter((client) => client.total_remaining <= 5)
        .sort((a, b) => a.total_remaining - b.total_remaining);

      const topLowSessionClients = clientsByPackStatus.slice(0, 3).map((c) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone_number,
        remaining: c.total_remaining,
      }));

      setLowSessionClients(topLowSessionClients);
    } catch (error: any) {
      console.error('Error fetching trainer dashboard data:', error);
      toast({
        title: 'Error loading dashboard',
        description: error.message || 'Failed to load dashboard data',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingDashboard(false);
      setIsLoadingLowSessions(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerId]);

  const handleViewSessionDetails = (session: any) => {
    setSelectedSessionForModal(session);
    setIsSessionDetailModalOpen(true);
  };

  const handleViewFullSchedule = () => {
    // Keep this as a button the user can click; AuthGuard manages route access
    window.location.href = '/schedule';
  };

  const handleViewFinanceTransactions = () => {
    window.location.href = '/finance/transactions';
  };

  if (isLoadingDashboard) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-body text-muted-foreground">Loading dashboard data...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />

      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-heading-1 mb-2">
            Welcome back, {trainer?.business_name?.split(' ')[0] || 'Trainer'}! 👋
          </h1>
          <p className="text-body-large text-muted-foreground">
            Here's what's happening with your training business today.
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="cursor-pointer" onClick={handleViewFinanceTransactions}>
            <MetricCard
              title="Weekly Earnings"
              value={`$${weeklyEarnings?.toFixed(2) || '0.00'}`}
              change={weeklyEarningsChange || 0}
              changeLabel="from last week"
              icon={<TrendingUp className="w-6 h-6 text-primary" />}
              positive={weeklyEarningsChange !== null && weeklyEarningsChange >= 0}
            />
          </div>
          <MetricCard
            title="Sessions This Week"
            value={sessionsThisWeek?.toString() || '0'}
            change={sessionsThisWeekChange || 0}
            changeLabel="from last week"
            icon={<Calendar className="w-6 h-6 text-primary" />}
            positive={sessionsThisWeekChange !== null && sessionsThisWeekChange >= 0}
          />
          <MetricCard
            title="Active Clients"
            value={activeClientsCount?.toString() || '0'}
            change={5}
            changeLabel="new this month"
            icon={<Users className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Outstanding Payments"
            value={`$${outstandingPaymentsTotal?.toFixed(2) || '0.00'}`}
            change={-15}
            changeLabel="from last week"
            icon={<CreditCard className="w-6 h-6 text-primary" />}
            positive={false}
          />
        </div>

        {/* Dashboard Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Today's Schedule */}
          <DashboardCard
            title="Today's Schedule"
            description="Your upcoming sessions for today"
            icon={<Clock className="w-5 h-5 text-primary" />}
            action={{
              label: 'View Full Schedule',
              onClick: handleViewFullSchedule,
              variant: 'outline',
            }}
          >
            <div className="space-y-3">
              {todaysSessions.length > 0 ? (
                todaysSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={() => handleViewSessionDetails(session)}
                  >
                    <div>
                      <p className="font-medium text-body-small">{session.client}</p>
                      <p className="text-body-small text-muted-foreground">
                        {session.time} • {session.type}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        session.status === 'scheduled' ? 'status-success' : 'status-warning'
                      }`}
                    >
                      {session.status === 'scheduled' ? 'Scheduled' : session.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <p className="text-body-small text-muted-foreground">No sessions scheduled for today</p>
                </div>
              )}
            </div>
          </DashboardCard>

          {/* Sessions Running Low */}
          <DashboardCard
            title="Sessions Running Low"
            description="Clients with 5 or fewer sessions remaining"
            icon={<AlertTriangle className="w-5 h-5 text-warning" />}
            action={{
              label: 'Contact Clients',
              onClick: () => console.log('Contact clients'),
              variant: 'outline',
            }}
          >
            <div className="space-y-3">
              {lowSessionClients.length > 0 ? (
                lowSessionClients.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                    <div>
                      <p className="font-medium text-body-small">{`${c.first_name} ${c.last_name}`.trim()}</p>
                      <p className="text-body-small text-muted-foreground">{c.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-body-small font-medium text-warning">{c.remaining} sessions remaining</p>
                      <p className="text-xs text-muted-foreground">across all active packs</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <p className="text-body-small text-muted-foreground">No clients currently low on session packs</p>
                </div>
              )}
            </div>
          </DashboardCard>

          {/* Overdue Payments */}
          <DashboardCard
            title="Overdue Payments"
            description="Payments that need your attention"
            icon={<CreditCard className="w-5 h-5 text-destructive" />}
            action={{
              label: 'Send Reminders',
              onClick: () => console.log('Send reminders'),
              variant: 'outline',
            }}
          >
            <div className="space-y-3">
              {overduePayments.length > 0 ? (
                overduePayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                    <div>
                      <p className="font-medium text-body-small">{p.client}</p>
                      <p className="text-body-small text-muted-foreground">{p.daysOverdue} days overdue</p>
                    </div>
                    <div className="text-right">
                      <p className="text-body-small font-medium text-destructive">${p.amount.toFixed(2)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <p className="text-body-small text-muted-foreground">No overdue payments</p>
                </div>
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Integration Placeholders */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="card-elevated opacity-75">
            <CardHeader>
              <CardTitle className="text-body">🗓️ Google Calendar Sync</CardTitle>
              <CardDescription>Two-way sync with your Google Calendar (Coming Soon)</CardDescription>
            </CardHeader>
          </Card>
          <Card className="card-elevated opacity-75">
            <CardHeader>
              <CardTitle className="text-body">📊 Xero Integration</CardTitle>
              <CardDescription>Automated financial reconciliation (Coming Soon)</CardDescription>
            </CardHeader>
          </Card>
          <Card className="card-elevated opacity-75">
            <CardHeader>
              <CardTitle className="text-body">💪 Trainerize API</CardTitle>
              <CardDescription>Program and nutrition data sync (Coming Soon)</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>

      {/* Session Detail Modal */}
      <UniversalSessionModal
        mode="view"
        isOpen={isSessionDetailModalOpen}
        onClose={() => setIsSessionDetailModalOpen(false)}
        session={selectedSessionForModal}
        onSessionUpdated={fetchDashboardData}
      />
    </div>
  );
};

export default TrainerDashboard;