import { useNavigate } from 'react-router-dom';
import { DashboardNavigation } from '@/components/Navigation';
import { DashboardCard, MetricCard } from '@/components/DashboardCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  Calendar, 
  CreditCard, 
  TrendingUp, 
  Clock,
  AlertTriangle,
  Plus,
  Eye,
  CheckCircle
} from 'lucide-react';

// Mock data - would come from Supabase in real implementation
const mockData = {
  todaysSessions: [
    { id: 1, client: 'Sarah Johnson', time: '9:00 AM', type: 'Strength Training', status: 'confirmed' },
    { id: 2, client: 'Mike Chen', time: '11:00 AM', type: 'HIIT Session', status: 'pending' },
    { id: 3, client: 'Emma Davis', time: '2:00 PM', type: 'Functional Movement', status: 'confirmed' },
    { id: 4, client: 'James Wilson', time: '4:00 PM', type: 'Weight Loss Session', status: 'confirmed' }
  ],
  lowSessionClients: [
    { id: 1, name: 'Sarah Johnson', remaining: 2, phone: '+61 412 345 678' },
    { id: 2, name: 'David Kim', remaining: 1, phone: '+61 423 456 789' },
    { id: 3, name: 'Lisa Chen', remaining: 3, phone: '+61 434 567 890' }
  ],
  overduePayments: [
    { id: 1, client: 'Tom Rodriguez', amount: 280, daysOverdue: 5 },
    { id: 2, client: 'Anna Smith', amount: 350, daysOverdue: 12 }
  ]
};

export default function Dashboard() {
  const navigate = useNavigate();

  const handleAddNewClient = () => {
    navigate('/clients/new');
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />
      
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-heading-1 mb-2">Welcome back, Alex! 👋</h1>
          <p className="text-body-large text-muted-foreground">
            Here's what's happening with your training business today.
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Weekly Earnings"
            value="$2,450"
            change={12}
            changeLabel="from last week"
            icon={<TrendingUp className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Sessions This Week"
            value="28"
            change={8}
            changeLabel="from last week"
            icon={<Calendar className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Active Clients"
            value="42"
            change={5}
            changeLabel="new this month"
            icon={<Users className="w-6 h-6 text-primary" />}
          />
          <MetricCard
            title="Outstanding Payments"
            value="$630"
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
              label: "View Full Schedule",
              onClick: () => console.log("View schedule"),
              variant: "outline"
            }}
          >
            <div className="space-y-3">
              {mockData.todaysSessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                  <div>
                    <p className="font-medium text-body-small">{session.client}</p>
                    <p className="text-body-small text-muted-foreground">
                      {session.time} • {session.type}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    session.status === 'confirmed' 
                      ? 'status-success' 
                      : 'status-warning'
                  }`}>
                    {session.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </DashboardCard>

          {/* Clients Nearing Package End */}
          <DashboardCard
            title="Sessions Running Low"
            description="Clients with 3 or fewer sessions remaining"
            icon={<AlertTriangle className="w-5 h-5 text-warning" />}
            action={{
              label: "Contact Clients",
              onClick: () => console.log("Contact clients"),
              variant: "outline"
            }}
          >
            <div className="space-y-3">
              {mockData.lowSessionClients.map((client) => (
                <div key={client.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                  <div>
                    <p className="font-medium text-body-small">{client.name}</p>
                    <p className="text-body-small text-muted-foreground">{client.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-body-small font-medium text-warning">
                      {client.remaining} sessions
                    </p>
                    <p className="text-xs text-muted-foreground">remaining</p>
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>

          {/* Overdue Payments */}
          <DashboardCard
            title="Overdue Payments"
            description="Payments that need your attention"
            icon={<CreditCard className="w-5 h-5 text-destructive" />}
            action={{
              label: "Send Reminders",
              onClick: () => console.log("Send reminders"),
              variant: "outline"
            }}
          >
            <div className="space-y-3">
              {mockData.overduePayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                  <div>
                    <p className="font-medium text-body-small">{payment.client}</p>
                    <p className="text-body-small text-muted-foreground">
                      {payment.daysOverdue} days overdue
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-body-small font-medium text-destructive">
                      ${payment.amount}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>

        {/* Quick Actions */}
        <Card className="card-elevated mt-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-primary" />
              <span>Quick Actions</span>
            </CardTitle>
            <CardDescription>
              Common tasks to keep your business running smoothly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button variant="professional" className="h-auto flex-col py-4" onClick={handleAddNewClient}>
                <Plus className="w-6 h-6 mb-2" />
                <span>Add New Client</span>
              </Button>
              <Button variant="professional" className="h-auto flex-col py-4">
                <Calendar className="w-6 h-6 mb-2" />
                <span>Schedule Session</span>
              </Button>
              <Button variant="professional" className="h-auto flex-col py-4">
                <Eye className="w-6 h-6 mb-2" />
                <span>View All Clients</span>
              </Button>
              <Button variant="professional" className="h-auto flex-col py-4">
                <CreditCard className="w-6 h-6 mb-2" />
                <span>Record Payment</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Integration Placeholders */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="card-elevated opacity-75">
            <CardHeader>
              <CardTitle className="text-body">🗓️ Google Calendar Sync</CardTitle>
              <CardDescription>
                Two-way sync with your Google Calendar (Coming Soon)
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="card-elevated opacity-75">
            <CardHeader>
              <CardTitle className="text-body">📊 Xero Integration</CardTitle>
              <CardDescription>
                Automated financial reconciliation (Coming Soon)
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="card-elevated opacity-75">
            <CardHeader>
              <CardTitle className="text-body">💪 Trainerize API</CardTitle>
              <CardDescription>
                Program and nutrition data sync (Coming Soon)
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    </div>
  );
}