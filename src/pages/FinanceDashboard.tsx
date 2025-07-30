import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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