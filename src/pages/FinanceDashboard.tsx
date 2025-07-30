import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Filter, DollarSign, CreditCard, Package, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { format, startOfYear, startOfMonth, startOfWeek, isWithinInterval } from 'date-fns';

interface Transaction {
  id: string;
  amount: number;
  due_date: string;
  date_paid: string | null;
  status: string;
  client_name: string;
  service_type_name: string;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
}

interface ServiceType {
  id: string;
  name: string;
}

export default function FinanceDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useMemo(() => new Date(), []);

  // Fetch all payments for the trainer
  const { data: payments, isLoading: isLoadingPayments, error: paymentsError } = useQuery({
    queryKey: ['trainerPayments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('payments')
        .select('amount, status, date_paid, due_date')
        .eq('trainer_id', user.id);
      if (error) { 
        console.error("Error fetching payments:", error); 
        throw error; 
      }
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch all active subscriptions for the trainer
  const { data: subscriptions, isLoading: isLoadingSubscriptions, error: subscriptionsError } = useQuery({
    queryKey: ['trainerSubscriptionsValue', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('client_subscriptions')
        .select('billing_amount, status')
        .eq('trainer_id', user.id)
        .in('status', ['active', 'paused']);
      if (error) { 
        console.error("Error fetching subscriptions:", error); 
        throw error; 
      }
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate Financial Metrics
  const financialMetrics = useMemo(() => {
    const metrics = {
      totalAllTimeEarnings: 0,
      totalYtdEarnings: 0,
      totalMtdEarnings: 0,
      totalWtdEarnings: 0,
      totalOutstandingPayments: 0,
      totalActiveSubscriptionsValue: 0,
    };

    const currentYearStart = startOfYear(today);
    const currentMonthStart = startOfMonth(today);
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });

    // Calculate earnings
    (payments || []).forEach(payment => {
      const paymentDate = payment.date_paid ? new Date(payment.date_paid) : null;
      if (payment.status === 'paid' && paymentDate) {
        metrics.totalAllTimeEarnings += payment.amount;
        if (isWithinInterval(paymentDate, { start: currentYearStart, end: today })) {
          metrics.totalYtdEarnings += payment.amount;
        }
        if (isWithinInterval(paymentDate, { start: currentMonthStart, end: today })) {
          metrics.totalMtdEarnings += payment.amount;
        }
        if (isWithinInterval(paymentDate, { start: currentWeekStart, end: today })) {
          metrics.totalWtdEarnings += payment.amount;
        }
      } else if (payment.status === 'due' || payment.status === 'overdue') {
        metrics.totalOutstandingPayments += payment.amount;
      }
    });

    // Calculate active subscriptions value
    (subscriptions || []).forEach(sub => {
      metrics.totalActiveSubscriptionsValue += sub.billing_amount || 0;
    });

    return metrics;
  }, [payments, subscriptions, today]);

  // State management
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const itemsPerPage = 15;

  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedServiceType, setSelectedServiceType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Fetch clients and service types for filters
  useEffect(() => {
    const fetchFilterData = async () => {
      if (!user?.id) return;

      try {
        // Fetch clients
        const { data: clientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id, name')
          .eq('trainer_id', user.id)
          .order('name');

        if (clientsError) throw clientsError;
        setClients(clientsData || []);

        // Fetch service types
        const { data: serviceTypesData, error: serviceTypesError } = await supabase
          .from('service_types')
          .select('id, name')
          .eq('trainer_id', user.id)
          .order('name');

        if (serviceTypesError) throw serviceTypesError;
        setServiceTypes(serviceTypesData || []);

      } catch (error: any) {
        console.error('Error fetching filter data:', error);
        toast({
          title: "Error",
          description: "Failed to load filter options",
          variant: "destructive",
        });
      }
    };

    fetchFilterData();
  }, [user?.id, toast]);

  // Fetch transactions with filters and pagination
  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user?.id) return;
      
      setLoadingTransactions(true);
      
      try {
        let query = supabase
          .from('payments')
          .select(`
            id,
            amount,
            due_date,
            date_paid,
            status,
            created_at,
            clients!inner(name),
            service_types!inner(name)
          `)
          .eq('trainer_id', user.id);

        // Apply filters
        if (startDate) {
          query = query.gte('due_date', startDate);
        }
        if (endDate) {
          query = query.lte('due_date', endDate);
        }
        if (clientSearch) {
          query = query.ilike('clients.name', `%${clientSearch}%`);
        }
        if (selectedServiceType && selectedServiceType !== 'all') {
          query = query.eq('service_type_id', selectedServiceType);
        }
        if (selectedStatus && selectedStatus !== 'all') {
          query = query.eq('status', selectedStatus);
        }

        // Get total count for pagination
        const countQuery = supabase
          .from('payments')
          .select('*', { count: 'exact', head: true })
          .eq('trainer_id', user.id);

        // Apply same filters to count query
        if (startDate) {
          countQuery.gte('due_date', startDate);
        }
        if (endDate) {
          countQuery.lte('due_date', endDate);
        }
        if (clientSearch) {
          countQuery.eq('clients.name', clientSearch);
        }
        if (selectedServiceType && selectedServiceType !== 'all') {
          countQuery.eq('service_type_id', selectedServiceType);
        }
        if (selectedStatus && selectedStatus !== 'all') {
          countQuery.eq('status', selectedStatus);
        }

        const { count } = await countQuery;
        setTotalRecords(count || 0);
        setTotalPages(Math.ceil((count || 0) / itemsPerPage));

        // Fetch paginated data
        const { data: transactionsData, error: transactionsError } = await query
          .order('created_at', { ascending: false })
          .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1);

        if (transactionsError) throw transactionsError;

        // Transform data
        const transformedTransactions = transactionsData?.map((payment: any) => ({
          id: payment.id,
          amount: payment.amount,
          due_date: payment.due_date,
          date_paid: payment.date_paid,
          status: payment.status,
          created_at: payment.created_at,
          client_name: payment.clients.name,
          service_type_name: payment.service_types.name,
        })) || [];

        setTransactions(transformedTransactions);

      } catch (error: any) {
        console.error('Error fetching transactions:', error);
        toast({
          title: "Error",
          description: "Failed to load transactions",
          variant: "destructive",
        });
      } finally {
        setLoadingTransactions(false);
      }
    };

    fetchTransactions();
  }, [user?.id, currentPage, startDate, endDate, clientSearch, selectedServiceType, selectedStatus, toast]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">Paid</Badge>;
      case 'due':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">Due</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Overdue</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setClientSearch('');
    setSelectedServiceType('all');
    setSelectedStatus('all');
    setCurrentPage(1);
  };

  if (isLoadingPayments || isLoadingSubscriptions) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNavigation />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-heading-1 mb-6">Financial Dashboard</h1>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2">Loading financial data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (paymentsError || subscriptionsError) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNavigation />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-heading-1 mb-6">Financial Dashboard</h1>
          <div className="text-red-500">
            Error loading financial data: {paymentsError?.message || subscriptionsError?.message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Button>
        </div>
        
        <div className="mb-8">
          <h1 className="text-heading-1 mb-2">Financial Dashboard</h1>
          <p className="text-body-large text-muted-foreground">
            View and manage all your payment transactions
          </p>
        </div>

        {/* Financial Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Total Earnings Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total All-Time Earnings</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(financialMetrics.totalAllTimeEarnings)}</div>
              <p className="text-xs text-muted-foreground">
                Sum of all paid sessions/packs/subscriptions
              </p>
            </CardContent>
          </Card>

          {/* YTD Earnings Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Earnings Year-to-Date</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(financialMetrics.totalYtdEarnings)}</div>
              <p className="text-xs text-muted-foreground">
                As of {format(today, 'PPP')}
              </p>
            </CardContent>
          </Card>

          {/* MTD Earnings Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Earnings Month-to-Date</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(financialMetrics.totalMtdEarnings)}</div>
              <p className="text-xs text-muted-foreground">
                As of {format(today, 'PPP')}
              </p>
            </CardContent>
          </Card>

          {/* WTD Earnings Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Earnings Week-to-Date</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(financialMetrics.totalWtdEarnings)}</div>
              <p className="text-xs text-muted-foreground">
                As of {format(today, 'PPP')}
              </p>
            </CardContent>
          </Card>

          {/* Outstanding Payments Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Outstanding Payments</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(financialMetrics.totalOutstandingPayments)}</div>
              <p className="text-xs text-muted-foreground">
                Payments due but not yet paid
              </p>
            </CardContent>
          </Card>

          {/* Total Active Subscriptions Value Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Active Subscriptions Value</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(financialMetrics.totalActiveSubscriptionsValue)}</div>
              <p className="text-xs text-muted-foreground">
                Recurring revenue from active plans
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="w-5 h-5" />
              <span>Filters</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Start Date</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">End Date</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Client Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search clients..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Service Type</label>
                <Select value={selectedServiceType} onValueChange={setSelectedServiceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All service types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All service types</SelectItem>
                    {serviceTypes.map((serviceType) => (
                      <SelectItem key={serviceType.id} value={serviceType.id}>
                        {serviceType.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="due">Due</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={clearFilters} className="w-full">
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Summary */}
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            Showing {transactions.length} of {totalRecords} transactions
          </p>
        </div>

        {/* Transactions Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Date Paid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTransactions ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading transactions...
                    </TableCell>
                  </TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">
                        {transaction.client_name}
                      </TableCell>
                      <TableCell>{transaction.service_type_name}</TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(transaction.amount)}
                      </TableCell>
                      <TableCell>{formatDate(transaction.due_date)}</TableCell>
                      <TableCell>{formatDate(transaction.date_paid)}</TableCell>
                      <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}