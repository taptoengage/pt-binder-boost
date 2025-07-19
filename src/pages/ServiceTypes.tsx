import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const serviceTypeSchema = z.object({
  name: z.string().min(1, 'Service type name is required').max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  billing_model: z.enum(['per_unit', 'pack', 'subscription'], {
    required_error: 'Please select a billing model',
  }),
  units_included: z.number().int().min(1, 'Units included must be at least 1').optional().nullable(),
  default_price: z.number().min(0.01, 'Price must be greater than 0'),
}).superRefine((data, ctx) => {
  // If billing model is 'pack', units_included is required
  if (data.billing_model === 'pack' && (!data.units_included || data.units_included < 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Units included is required for pack billing model',
      path: ['units_included'],
    });
  }
});

type ServiceTypeFormData = z.infer<typeof serviceTypeSchema>;

interface ServiceType {
  id: string;
  name: string;
  description: string | null;
  billing_model: string;
  units_included: number | null;
  default_price: number;
  created_at: string;
}

export default function ServiceTypes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ServiceTypeFormData>({
    resolver: zodResolver(serviceTypeSchema),
    defaultValues: {
      name: '',
      description: '',
      billing_model: 'per_unit',
      units_included: null,
      default_price: 0,
    },
  });

  const fetchServiceTypes = async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .eq('trainer_id', user.id)
        .order('name', { ascending: true });

      if (error) throw error;
      setServiceTypes(data || []);
    } catch (error) {
      console.error('Error fetching service types:', error);
      toast({
        title: 'Error',
        description: 'Failed to load service types. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceTypes();
  }, [user?.id]);

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const onSubmit = async (data: ServiceTypeFormData) => {
    if (!user?.id) {
      return;
    }

    try {
      setIsSubmitting(true);
      
      const { error } = await supabase
        .from('service_types')
        .insert({
          name: data.name,
          description: data.description || null,
          billing_model: data.billing_model,
          units_included: data.billing_model === 'pack' ? data.units_included : null,
          default_price: Number(data.default_price),
          trainer_id: user.id,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Service type created successfully!',
      });

      form.reset();
      setIsModalOpen(false);
      fetchServiceTypes(); // Refresh the list
    } catch (error) {
      console.error('Error creating service type:', error);
      toast({
        title: 'Error',
        description: 'Failed to create service type. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={handleBackToDashboard}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-heading-1 mb-2">Manage Service Types</h1>
              <p className="text-muted-foreground">
                Create and manage your custom service types for sessions and payments.
              </p>
            </div>
            
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger asChild>
                <Button variant="professional">
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Service Type
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Service Type</DialogTitle>
                  <DialogDescription>
                    Create a new service type that you can use for sessions and payments.
                  </DialogDescription>
                </DialogHeader>
                
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Type Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Personal Training, Group Session, Consultation"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Brief description of this service type..."
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="billing_model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billing Model *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select billing model" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="per_unit">Per Unit</SelectItem>
                              <SelectItem value="pack">Pack</SelectItem>
                              <SelectItem value="subscription">Subscription</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="default_price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Price *</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                              <Input 
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                className="pl-8"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {form.watch('billing_model') === 'pack' && (
                      <FormField
                        control={form.control}
                        name="units_included"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Units Included *</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                min="1"
                                placeholder="e.g., 10 sessions"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || null)}
                                value={field.value || ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    
                    <div className="flex justify-end space-x-2 pt-4">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsModalOpen(false)}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Create Service Type
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Service Types</CardTitle>
            <CardDescription>
              Manage your available service types for sessions and payments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Loading service types...</span>
              </div>
            ) : serviceTypes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  No service types defined yet. Click 'Add New Service Type' to get started!
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Billing Model</TableHead>
                    <TableHead>Default Price</TableHead>
                    <TableHead>Units Included</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceTypes.map((serviceType) => (
                    <TableRow key={serviceType.id}>
                      <TableCell className="font-medium">
                        {serviceType.name}
                      </TableCell>
                      <TableCell>
                        {serviceType.description || <span className="text-muted-foreground">No description</span>}
                      </TableCell>
                      <TableCell>
                        <span className="capitalize">
                          {serviceType.billing_model.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        ${serviceType.default_price?.toFixed(2) || '0.00'}
                      </TableCell>
                      <TableCell>
                        {serviceType.billing_model === 'pack' 
                          ? serviceType.units_included || 'N/A'
                          : <span className="text-muted-foreground">N/A</span>
                        }
                      </TableCell>
                      <TableCell>
                        {new Date(serviceType.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}