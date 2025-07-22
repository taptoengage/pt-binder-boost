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

type ServiceTypeFormData = z.infer<typeof serviceTypeSchema>;

// Simplified interface for core service types
interface ServiceType {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export default function ServiceTypes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingServiceType, setEditingServiceType] = useState<ServiceType | null>(null);

  const form = useForm<ServiceTypeFormData>({
    resolver: zodResolver(serviceTypeSchema),
    defaultValues: {
      name: '',
      description: '',
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
                Create and manage your core service types.
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
              Manage your core service types.
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
                                  Are you sure you want to delete "{serviceType.name}"? This action cannot be undone.
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
      </main>
    </div>
  );
}