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
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useQuery } from '@tanstack/react-query';
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
  total_trainers: number;
  total_clients: number;
  active_session_packs: number;
  total_revenue: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  
  const [waitlistSignups, setWaitlistSignups] = useState<WaitlistSignup[]>([]);
  const [filteredSignups, setFilteredSignups] = useState<WaitlistSignup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch admin metrics using the secure RPC
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ['adminMetrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_metrics' as any);
      
      if (error) throw error;
      return data?.[0] || {
        total_trainers: 0,
        total_clients: 0,
        active_session_packs: 0,
        total_revenue: 0
      };
    },
    enabled: isAdmin === true, // Only fetch if user is confirmed admin
    retry: 1
  });

  // Fetch waitlist signups (separate query with RLS protection)
  const { data: waitlistData, isLoading: waitlistLoading } = useQuery({
    queryKey: ['waitlistSignups'],
    queryFn: async () => {
      const { data: signups, error } = await supabase
        .from('waitlist_signups')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return signups || [];
    },
    enabled: isAdmin === true, // Only fetch if user is confirmed admin
    retry: 1
  });

  useEffect(() => {
    if (waitlistData) {
      setWaitlistSignups(waitlistData);
    }
  }, [waitlistData]);

  useEffect(() => {
    // Filter waitlist signups based on search term
    const filtered = waitlistSignups.filter(signup =>
      signup.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      signup.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      signup.source.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredSignups(filtered);
  }, [searchTerm, waitlistSignups]);

  useEffect(() => {
    if (metricsError) {
      console.error('Error fetching admin metrics:', metricsError);
      toast({
        title: "Error loading admin data",
        description: metricsError.message || "Failed to load admin dashboard data",
        variant: "destructive",
      });
    }
  }, [metricsError, toast]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600';
      case 'approved': return 'text-green-600';
      case 'rejected': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  // Block rendering if admin check is loading or user is not admin
  if (adminLoading || isAdmin !== true) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-body text-muted-foreground">
                {adminLoading ? 'Verifying admin access...' : 'Loading admin dashboard...'}
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Show loading state while fetching admin data
  if (metricsLoading || waitlistLoading) {
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
            value={(metrics?.total_trainers || 0).toString()}
            change={8}
            changeLabel="new this month"
            icon={<UserCheck className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Total Clients"
            value={(metrics?.total_clients || 0).toString()}
            change={15}
            changeLabel="new this month"
            icon={<Users className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Waitlist Signups"
            value={waitlistSignups.length.toString()}
            change={23}
            changeLabel="this week"
            icon={<Mail className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Platform Revenue"
            value={`$${(metrics?.total_revenue || 0).toFixed(2)}`}
            change={12.5}
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
                <span className="font-medium">{metrics?.total_trainers || 0}</span>
              </div>
              <div className="flex justify-between text-body-small">
                <span>Active Clients:</span>
                <span className="font-medium">{metrics?.total_clients || 0}</span>
              </div>
              <div className="flex justify-between text-body-small">
                <span>Active Packs:</span>
                <span className="font-medium">{metrics?.active_session_packs || 0}</span>
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