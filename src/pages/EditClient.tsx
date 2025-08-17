import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export default function EditClient() {
  const navigate = useNavigate();
  const { clientId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    email: '',
    default_session_rate: '',
    training_age: '',
    rough_goals: '',
    physical_activity_readiness: ''
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientName, setClientName] = useState('');

  useEffect(() => {
    const fetchClientData = async () => {
      if (!user || !clientId) return;

      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('id', clientId)
          .eq('trainer_id', user.id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            toast({
              title: "Client Not Found",
              description: "The client you're looking for doesn't exist or you don't have access to it.",
              variant: "destructive",
            });
            navigate('/clients');
            return;
          }
          throw error;
        }

        setClientName(`${data.first_name} ${data.last_name}`.trim());
        setFormData({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          phone_number: data.phone_number,
          email: data.email,
          default_session_rate: data.default_session_rate.toString(),
          training_age: data.training_age ? data.training_age.toString() : '',
          rough_goals: data.rough_goals || '',
          physical_activity_readiness: data.physical_activity_readiness || ''
        });

      } catch (error) {
        console.error('Error fetching client:', error);
        toast({
          title: "Error",
          description: "Failed to load client data. Please try again.",
          variant: "destructive",
        });
        navigate('/clients');
      } finally {
        setIsLoading(false);
      }
    };

    fetchClientData();
  }, [user, clientId, navigate, toast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !clientId) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to edit a client.",
        variant: "destructive",
      });
      return;
    }

    // Basic client-side validation
    if (!formData.first_name.trim() || !formData.phone_number.trim() || !formData.email.trim() || !formData.default_session_rate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (first name, phone, email, rate).",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare data for update
      const clientData = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        phone_number: formData.phone_number.trim(),
        email: formData.email.trim(),
        default_session_rate: parseFloat(formData.default_session_rate),
        training_age: formData.training_age ? parseInt(formData.training_age) : null,
        rough_goals: formData.rough_goals.trim() || null,
        physical_activity_readiness: formData.physical_activity_readiness.trim() || null,
      };

      // Update client in Supabase
      const { error } = await supabase
        .from('clients')
        .update(clientData)
        .eq('id', clientId)
        .eq('trainer_id', user.id);

      if (error) {
        throw error;
      }

      // Show success toast
      toast({
        title: "Success!",
        description: "Client updated successfully.",
      });

      // Redirect back to client detail page
      navigate(`/clients/${clientId}`);
    } catch (error) {
      console.error('Error updating client:', error);
      toast({
        title: "Error",
        description: "Failed to update client. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturn = () => {
    navigate(`/clients/${clientId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNavigation />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              onClick={handleReturn}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-heading-2">Edit Client: {clientName}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input
                      id="first_name"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleInputChange}
                      required
                      placeholder="Enter client's first name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleInputChange}
                      placeholder="Enter client's last name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone_number">Phone Number *</Label>
                    <Input
                      id="phone_number"
                      name="phone_number"
                      value={formData.phone_number}
                      onChange={handleInputChange}
                      required
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      placeholder="client@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default_session_rate">Default Session Rate *</Label>
                    <Input
                      id="default_session_rate"
                      name="default_session_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.default_session_rate}
                      onChange={handleInputChange}
                      required
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="training_age">Training Age (years)</Label>
                    <Input
                      id="training_age"
                      name="training_age"
                      type="number"
                      min="0"
                      value={formData.training_age}
                      onChange={handleInputChange}
                      placeholder="e.g., 2"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rough_goals">Rough Goals</Label>
                  <Textarea
                    id="rough_goals"
                    name="rough_goals"
                    value={formData.rough_goals}
                    onChange={handleInputChange}
                    placeholder="Describe client's fitness goals..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="physical_activity_readiness">Physical Activity Readiness</Label>
                  <Textarea
                    id="physical_activity_readiness"
                    name="physical_activity_readiness"
                    value={formData.physical_activity_readiness}
                    onChange={handleInputChange}
                    placeholder="Any health considerations or physical limitations..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-4 pt-6">
                  <Button 
                    type="submit" 
                    variant="gradient" 
                    className="flex items-center gap-2"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleReturn} disabled={isSubmitting}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}