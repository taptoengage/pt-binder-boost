import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Edit, Save, X, User, Clock, MessageSquare, Phone, Mail, MessageCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useNavigate } from 'react-router-dom';

// Form validation schema
const EditProfileSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().optional(),
  email: z.string().email('Invalid email address'),
  phone_number: z.string().min(1, 'Phone number is required'),
});

type EditProfileFormData = z.infer<typeof EditProfileSchema>;

export default function ClientProfile() {
  const { client } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(false);

  // Fetch client profile data with trainer information
  const { data: clientProfile, isLoading, error } = useQuery({
    queryKey: ['clientProfile', client?.id],
    queryFn: async () => {
      if (!client?.id) throw new Error('Client not found');
      
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          trainers!trainer_id (
            id,
            business_name,
            contact_email,
            phone,
            instagram_handle,
            whatsapp_id
          )
        `)
        .eq('id', client.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!client?.id,
  });

  // Initialize form with default values
  const form = useForm<EditProfileFormData>({
    resolver: zodResolver(EditProfileSchema),
    defaultValues: {
      first_name: clientProfile?.first_name || '',
      last_name: clientProfile?.last_name || '',
      email: clientProfile?.email || '',
      phone_number: clientProfile?.phone_number || '',
    },
  });

  // Reset form when clientProfile changes or when exiting edit mode
  useEffect(() => {
    if (clientProfile) {
      form.reset({
        first_name: clientProfile.first_name || '',
        last_name: clientProfile.last_name || '',
        email: clientProfile.email || '',
        phone_number: clientProfile.phone_number || '',
      });
      setEmailNotifications(clientProfile.email_notifications_enabled || false);
    }
  }, [clientProfile, form]);

  useEffect(() => {
    if (!isEditing && clientProfile) {
      form.reset({
        first_name: clientProfile.first_name || '',
        last_name: clientProfile.last_name || '',
        email: clientProfile.email || '',
        phone_number: clientProfile.phone_number || '',
      });
    }
  }, [isEditing, clientProfile, form]);

  // Handle form submission
  const onSubmit = async (data: EditProfileFormData) => {
    if (!client?.id) return;

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone_number: data.phone_number,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id);

      if (error) throw error;

      // Invalidate the query to refresh data
      queryClient.invalidateQueries({ queryKey: ['clientProfile'] });
      
      setIsEditing(false);
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: `Failed to update profile: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  // Handle email notifications toggle
  const handleEmailNotificationsToggle = async (enabled: boolean) => {
    if (!client?.id) return;

    // Optimistic update
    const previousState = emailNotifications;
    setEmailNotifications(enabled);

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          email_notifications_enabled: enabled,
          email_opt_in_at: enabled ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id);

      if (error) throw error;

      // Invalidate the query to refresh data
      queryClient.invalidateQueries({ queryKey: ['clientProfile'] });
      
      toast({
        title: enabled ? "Email notifications enabled." : "Email notifications disabled.",
        description: enabled 
          ? "You'll receive reminders and important updates about your sessions." 
          : "You won't receive any email notifications.",
      });
    } catch (error: any) {
      console.error('Error updating email notifications:', error);
      // Revert optimistic update
      setEmailNotifications(previousState);
      toast({
        title: "Error",
        description: "Couldn't update preferences. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Contact handlers
  const handleCall = () => {
    if (clientProfile?.trainers?.phone) {
      window.open(`tel:${clientProfile.trainers.phone}`, '_self');
    }
  };

  const handleEmail = () => {
    if (clientProfile?.trainers?.contact_email) {
      window.open(`mailto:${clientProfile.trainers.contact_email}`, '_self');
    }
  };

  const handleWhatsApp = () => {
    if (clientProfile?.trainers?.whatsapp_id) {
      window.open(`https://wa.me/${clientProfile.trainers.whatsapp_id.replace(/\D/g, '')}`, '_blank');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error || !clientProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Error loading profile data. Please try again.
            </p>
            <Button onClick={() => navigate('/client/dashboard')} className="w-full mt-4">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Profile</h1>
            <p className="text-muted-foreground">Manage your personal information and preferences</p>
          </div>
          <Button onClick={() => navigate('/client/dashboard')} variant="outline">
            Back to Dashboard
          </Button>
        </div>

        {/* Trainer Information */}
        {clientProfile?.trainers && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Your Trainer
              </CardTitle>
              <CardDescription>
                Contact information for your personal trainer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold mb-1">
                    {clientProfile.trainers.business_name}
                  </h3>
                  <p className="text-muted-foreground">Personal Trainer</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {clientProfile.trainers.phone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCall}
                      className="flex items-center gap-2"
                    >
                      <Phone className="h-4 w-4" />
                      Call
                    </Button>
                  )}
                  {clientProfile.trainers.contact_email && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEmail}
                      className="flex items-center gap-2"
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </Button>
                  )}
                  {clientProfile.trainers.whatsapp_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleWhatsApp}
                      className="flex items-center gap-2"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-8 md:grid-cols-2">
          {/* Contact Information */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Contact Information
                </CardTitle>
                <CardDescription>
                  Update your personal details and contact information
                </CardDescription>
              </div>
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit Profile
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          {isEditing ? (
                            <Input {...field} placeholder="Enter your first name" />
                          ) : (
                            <div className="p-3 border rounded-md bg-muted/50">
                              {field.value || 'Not provided'}
                            </div>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          {isEditing ? (
                            <Input {...field} placeholder="Enter your last name" />
                          ) : (
                            <div className="p-3 border rounded-md bg-muted/50">
                              {field.value || 'Not provided'}
                            </div>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          {isEditing ? (
                            <Input {...field} type="email" placeholder="Enter your email" />
                          ) : (
                            <div className="p-3 border rounded-md bg-muted/50">
                              {field.value || 'Not provided'}
                            </div>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          {isEditing ? (
                            <Input {...field} placeholder="Enter your phone number" />
                          ) : (
                            <div className="p-3 border rounded-md bg-muted/50">
                              {field.value || 'Not provided'}
                            </div>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isEditing && (
                    <div className="flex gap-2 pt-4">
                      <Button type="submit" className="flex items-center gap-2">
                        <Save className="h-4 w-4" />
                        Save Changes
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditing(false)}
                        className="flex items-center gap-2"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Preferred Time Slots
                </CardTitle>
                <CardDescription>
                  Set your preferred training times (Coming Soon)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-6 border rounded-lg bg-muted/50 text-center">
                  <Clock className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    Time slot preferences will be available soon. You'll be able to set your preferred training days and times.
                  </p>
                  <Button variant="outline" disabled>
                    Configure Preferences
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Communication Preferences
                </CardTitle>
                <CardDescription>
                  Manage how you receive updates about your sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">Receive email notifications</div>
                    <div className="text-sm text-muted-foreground">
                      Reminders and schedule changes for your sessions.
                    </div>
                  </div>
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={handleEmailNotificationsToggle}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}