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
import { ArrowLeft, Plus, Loader2, Eye, Edit, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

// Simplified schema for core service types (only name and description)
const serviceTypeSchema = z.object({
  name: z.string().min(1, 'Service type name is required').max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

// Schema for service offerings
const serviceOfferingSchema = z.object({
  billing_model: z.enum(['per_unit', 'pack', 'subscription'], {
    message: 'Please select a billing model',
  }),
  price: z.number().min(0.01, 'Price must be greater than 0'),
  units_included: z.number().int().min(1, 'Units included must be at least 1').optional().nullable(),
  name_suffix: z.string().max(100, 'Name suffix must be less than 100 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  status: z.enum(['active', 'inactive']),
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
type ServiceOfferingFormData = z.infer<typeof serviceOfferingSchema>;

// Simplified interface for core service types
interface ServiceType {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Interface for service offerings
interface ServiceOffering {
  id: string;
  service_type_id: string;
  billing_model: string;
  price: number;
  units_included: number | null;
  name_suffix: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function ServiceTypes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [serviceOfferings, setServiceOfferings] = useState<ServiceOffering[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOfferingsModalOpen, setIsOfferingsModalOpen] = useState(false);
  const [isOfferingFormOpen, setIsOfferingFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType | null>(null);
  const [editingServiceType, setEditingServiceType] = useState<ServiceType | null>(null);

  const form = useForm<ServiceTypeFormData>({
    resolver: zodResolver(serviceTypeSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const offeringForm = useForm<ServiceOfferingFormData>({
    resolver: zodResolver(serviceOfferingSchema),
    defaultValues: {
      billing_model: 'per_unit',
      price: 0,
      units_included: null,
      name_suffix: '',
      description: '',
      status: 'active',
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
        .select('id, name, description, created_at, updated_at')
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

  const fetchServiceOfferings = async (serviceTypeId: string) => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('service_offerings')
        .select('*')
        .eq('trainer_id', user.id)
        .eq('service_type_id', serviceTypeId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServiceOfferings(data || []);
    } catch (error) {
      console.error('Error fetching service offerings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load service offerings. Please try again.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchServiceTypes();
  }, [user?.id]);

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const onSubmit = async (data: ServiceTypeFormData) => {
    if (!user?.id) return;

    try {
      setIsSubmitting(true);
      
      if (editingServiceType) {
        // Update existing service type
        const { error } = await supabase
          .from('service_types')
          .update({
            name: data.name,
            description: data.description || null,
          })
          .eq('id', editingServiceType.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Service type updated successfully!',
        });
      } else {
        // Create new service type
        const { error } = await supabase
          .from('service_types')
          .insert({
            name: data.name,
            description: data.description || null,
            trainer_id: user.id,
          });

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Service type created successfully!',
        });
      }

      form.reset();
      setIsModalOpen(false);
      setEditingServiceType(null);
      fetchServiceTypes();
    } catch (error) {
      console.error('Error saving service type:', error);
      toast({
        title: 'Error',
        description: 'Failed to save service type. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onOfferingSubmit = async (data: ServiceOfferingFormData) => {
    if (!user?.id || !selectedServiceType?.id) return;

    try {
      setIsSubmitting(true);
      
      const { error } = await supabase
        .from('service_offerings')
        .insert({
          service_type_id: selectedServiceType.id,
          billing_model: data.billing_model,
          price: Number(data.price),
          units_included: data.billing_model === 'pack' ? data.units_included : null,
          name_suffix: data.name_suffix || null,
          description: data.description || null,
          status: data.status,
          trainer_id: user.id,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Service offering created successfully!',
      });

      offeringForm.reset();
      setIsOfferingFormOpen(false);
      fetchServiceOfferings(selectedServiceType.id);
    } catch (error) {
      console.error('Error creating service offering:', error);
      toast({
        title: 'Error',
        description: 'Failed to create service offering. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManageOfferings = (serviceType: ServiceType) => {
    setSelectedServiceType(serviceType);
    setIsOfferingsModalOpen(true);
    fetchServiceOfferings(serviceType.id);
  };

  const handleEditServiceType = (serviceType: ServiceType) => {
    setEditingServiceType(serviceType);
    form.setValue('name', serviceType.name);
    form.setValue('description', serviceType.description || '');
    setIsModalOpen(true);
  };

  const handleDeleteServiceType = async (serviceTypeId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('service_types')
        .delete()
        .eq('id', serviceTypeId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Service type deleted successfully!',
      });

      fetchServiceTypes();
    } catch (error) {
      console.error('Error deleting service type:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete service type. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteOffering = async (offeringId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('service_offerings')
        .delete()
        .eq('id', offeringId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Service offering deleted successfully!',
      });

      if (selectedServiceType) {
        fetchServiceOfferings(selectedServiceType.id);
      }
    } catch (error) {
      console.error('Error deleting service offering:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete service offering. Please try again.',
        variant: 'destructive',
      });
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
                Create and manage your core service types and their billable offerings.
              </p>
            </div>
            
            <Dialog open={isModalOpen} onOpenChange={(open) => {
              setIsModalOpen(open);
              if (!open) {
                setEditingServiceType(null);
                form.reset();
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="professional">
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Service Type
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingServiceType ? 'Edit Service Type' : 'Add New Service Type'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingServiceType 
                      ? 'Update the core service type details.'
                      : 'Create a new core service type. You can add specific offerings for this type later.'
                    }
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
                        {editingServiceType ? 'Update Service Type' : 'Create Service Type'}
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
              Manage your core service types and their specific offerings.
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
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
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
                        {new Date(serviceType.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleManageOfferings(serviceType)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Manage Offerings
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditServiceType(serviceType)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Service Type</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{serviceType.name}"? This action cannot be undone and will also delete all associated service offerings.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteServiceType(serviceType.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Service Offerings Management Modal */}
        <Dialog open={isOfferingsModalOpen} onOpenChange={setIsOfferingsModalOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Manage Offerings for "{selectedServiceType?.name}"
              </DialogTitle>
              <DialogDescription>
                Create and manage specific billing offerings for this service type.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Current Offerings</h3>
                <Button
                  variant="outline"
                  onClick={() => setIsOfferingFormOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Offering
                </Button>
              </div>

              {serviceOfferings.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground">
                    No offerings created yet. Add your first offering to get started!
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Billing Model</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Units Included</TableHead>
                      <TableHead>Suffix</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceOfferings.map((offering) => (
                      <TableRow key={offering.id}>
                        <TableCell className="capitalize">
                          {offering.billing_model.replace('_', ' ')}
                        </TableCell>
                        <TableCell>${offering.price.toFixed(2)}</TableCell>
                        <TableCell>
                          {offering.billing_model === 'pack' 
                            ? offering.units_included || 'N/A'
                            : <span className="text-muted-foreground">N/A</span>
                          }
                        </TableCell>
                        <TableCell>
                          {offering.name_suffix || <span className="text-muted-foreground">None</span>}
                        </TableCell>
                        <TableCell>
                          <span className={`capitalize ${offering.status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>
                            {offering.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Service Offering</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this offering? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteOffering(offering.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Add New Offering Form */}
              {isOfferingFormOpen && (
                <Card>
                  <CardHeader>
                    <CardTitle>Add New Offering</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Form {...offeringForm}>
                      <form onSubmit={offeringForm.handleSubmit(onOfferingSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={offeringForm.control}
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
                            control={offeringForm.control}
                            name="price"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Price *</FormLabel>
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

                          {offeringForm.watch('billing_model') === 'pack' && (
                            <FormField
                              control={offeringForm.control}
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

                          <FormField
                            control={offeringForm.control}
                            name="name_suffix"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Name Suffix (Optional)</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="e.g., Premium, Basic"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={offeringForm.control}
                            name="status"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Status *</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={offeringForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description (Optional)</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Specific details about this offering..."
                                  rows={2}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <div className="flex justify-end space-x-2 pt-4">
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                              setIsOfferingFormOpen(false);
                              offeringForm.reset();
                            }}
                            disabled={isSubmitting}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create Offering
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}