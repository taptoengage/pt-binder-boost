import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function AddClient() {
  const navigate = useNavigate();
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
  
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if user is authenticated
    if (!user) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to add a client.",
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

    setIsLoading(true);

    try {
      // Get the current session to pass authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No valid session found');
      }

      // Call the Edge Function to create client with auth account
      const response = await supabase.functions.invoke('create-client-with-auth', {
        body: {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          phone_number: formData.phone_number.trim(),
          email: formData.email.trim(),
          default_session_rate: formData.default_session_rate,
          training_age: formData.training_age || null,
          rough_goals: formData.rough_goals.trim() || null,
          physical_activity_readiness: formData.physical_activity_readiness.trim() || null,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create client');
      }

      // Show success toast
      toast({
        title: "Success!",
        description: "Client created successfully with new user account. Password reset email sent to client.",
      });

      // Redirect to clients list
      navigate('/clients');
    } catch (error: any) {
      console.error('Error adding client:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add client. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/clients');
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              onClick={handleCancel}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Clients
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-heading-2">Add New Client</CardTitle>
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
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isLoading ? 'Saving...' : 'Save Client'}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
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