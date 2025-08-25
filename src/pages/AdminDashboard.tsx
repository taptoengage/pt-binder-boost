import { useEffect, useState } from 'react';
import { DashboardNavigation } from '@/components/Navigation';
import { DashboardCard, MetricCard } from '@/components/DashboardCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  UserCheck, 
  Mail, 
  TrendingUp, 
  Calendar,
  CreditCard,
  Database,
  Settings,
  BarChart3,
  Loader2,
  Search,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';

interface WaitlistSignup {
  id: string;
  email: string;
  status: string;
  source: string;
  created_at: string;
  metadata?: any;
}

interface AdminMetrics {
  totalTrainers: number;
  totalClients: number;
  totalWaitlistSignups: number;
  activeSessionPacks: number;
  totalRevenue: number;
  monthlyGrowth: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [waitlistSignups, setWaitlistSignups] = useState<WaitlistSignup[]>([]);
  const [filteredSignups, setFilteredSignups] = useState<WaitlistSignup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalTrainers: 0,
    totalClients: 0,
    totalWaitlistSignups: 0,
    activeSessionPacks: 0,
    totalRevenue: 0,
    monthlyGrowth: 0
  });

  useEffect(() => {
    fetchAdminData();
  }, [user?.id]);

  useEffect(() => {
    // Filter waitlist signups based on search term
    const filtered = waitlistSignups.filter(signup =>
      signup.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      signup.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      signup.source.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredSignups(filtered);
  }, [searchTerm, waitlistSignups]);

  const fetchAdminData = async () => {
    if (!user?.id) return;
    
    try {
      setIsLoading(true);

      // Fetch waitlist signups
      const { data: signups, error: signupsError } = await supabase
        .from('waitlist_signups')
        .select('*')
        .order('created_at', { ascending: false });

      if (signupsError) throw signupsError;
      setWaitlistSignups(signups || []);

      // Fetch metrics
      const [trainersCount, clientsCount, sessionPacksCount, revenueData] = await Promise.all([
        // Total trainers
        supabase
          .from('trainers')
          .select('id', { count: 'exact' }),
        
        // Total clients
        supabase
          .from('clients')
          .select('id', { count: 'exact' }),
        
        // Active session packs
        supabase
          .from('session_packs')
          .select('id', { count: 'exact' })
          .eq('status', 'active'),
        
        // Total revenue (paid payments)
        supabase
          .from('payments')
          .select('amount')
          .eq('status', 'paid')
      ]);

      const totalRevenue = revenueData.data?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;

      setMetrics({
        totalTrainers: trainersCount.count || 0,
        totalClients: clientsCount.count || 0,
        totalWaitlistSignups: signups?.length || 0,
        activeSessionPacks: sessionPacksCount.count || 0,
        totalRevenue,
        monthlyGrowth: 12.5 // Placeholder for now
      });

    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      toast({
        title: "Error loading admin data",
        description: error.message || "Failed to load admin dashboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600';
      case 'approved': return 'text-green-600';
      case 'rejected': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-body text-muted-foreground">Loading admin dashboard...</p>
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
          <h1 className="text-heading-1 mb-2">Admin Dashboard 🎛️</h1>
          <p className="text-body-large text-muted-foreground">
            Platform overview and management tools.
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Total Trainers"
            value={metrics.totalTrainers.toString()}
            change={8}
            changeLabel="new this month"
            icon={<UserCheck className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Total Clients"
            value={metrics.totalClients.toString()}
            change={15}
            changeLabel="new this month"
            icon={<Users className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Waitlist Signups"
            value={metrics.totalWaitlistSignups.toString()}
            change={23}
            changeLabel="this week"
            icon={<Mail className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Platform Revenue"
            value={`$${metrics.totalRevenue.toFixed(2)}`}
            change={metrics.monthlyGrowth}
            changeLabel="from last month"
            icon={<TrendingUp className="w-6 h-6 text-primary" />}
          />
        </div>

        {/* Management Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {/* User Management Placeholder */}
          <DashboardCard
            title="User Management"
            description="Manage trainers, clients, and user roles"
            icon={<Users className="w-5 h-5 text-primary" />}
            action={{
              label: "Coming Soon",
              onClick: () => toast({ title: "Coming Soon", description: "User management features will be available soon." }),
              variant: "outline"
            }}
          >
            <div className="space-y-2">
              <div className="flex justify-between text-body-small">
                <span>Active Trainers:</span>
                <span className="font-medium">{metrics.totalTrainers}</span>
              </div>
              <div className="flex justify-between text-body-small">
                <span>Active Clients:</span>
                <span className="font-medium">{metrics.totalClients}</span>
              </div>
              <div className="flex justify-between text-body-small">
                <span>Active Packs:</span>
                <span className="font-medium">{metrics.activeSessionPacks}</span>
              </div>
            </div>
          </DashboardCard>

          {/* Analytics Placeholder */}
          <DashboardCard
            title="Analytics & Reports"
            description="Platform insights and performance metrics"
            icon={<BarChart3 className="w-5 h-5 text-primary" />}
            action={{
              label: "Coming Soon",
              onClick: () => toast({ title: "Coming Soon", description: "Advanced analytics will be available soon." }),
              variant: "outline"
            }}
          >
            <div className="space-y-2 text-body-small text-muted-foreground">
              <p>• Revenue analytics</p>
              <p>• User engagement metrics</p>
              <p>• Growth tracking</p>
              <p>• Custom reporting</p>
            </div>
          </DashboardCard>

          {/* System Settings Placeholder */}
          <DashboardCard
            title="System Settings"
            description="Platform configuration and maintenance"
            icon={<Settings className="w-5 h-5 text-primary" />}
            action={{
              label: "Coming Soon",
              onClick: () => toast({ title: "Coming Soon", description: "System settings will be available soon." }),
              variant: "outline"
            }}
          >
            <div className="space-y-2 text-body-small text-muted-foreground">
              <p>• Platform configuration</p>
              <p>• Email templates</p>
              <p>• Payment settings</p>
              <p>• Security policies</p>
            </div>
          </DashboardCard>
        </div>

        {/* Waitlist Management */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div>
                <CardTitle className="flex items-center space-x-2">
                  <Database className="w-5 h-5" />
                  <span>Waitlist Management</span>
                </CardTitle>
                <p className="text-body-small text-muted-foreground mt-1">
                  Manage and track waitlist signups
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search signups..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 w-64"
                  />
                </div>
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-2" />
                  Filter
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredSignups.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Signup Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSignups.map((signup) => (
                      <TableRow key={signup.id}>
                        <TableCell className="font-medium">
                          {signup.email}
                        </TableCell>
                        <TableCell>
                          <span className={`capitalize ${getStatusColor(signup.status)}`}>
                            {signup.status}
                          </span>
                        </TableCell>
                        <TableCell className="capitalize">
                          {signup.source}
                        </TableCell>
                        <TableCell>
                          {format(new Date(signup.created_at), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8">
                <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-body text-muted-foreground">
                  {searchTerm ? 'No signups match your search.' : 'No waitlist signups yet.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}