import React, { useState, useEffect } from 'react';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Phone, Mail, Instagram, Facebook, MessageCircle, Link2, Upload, Edit, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

// Zod Schema for editable profile fields
const EditProfileSchema = z.object({
  contact_email: z.string().email('Invalid email address.').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  instagram_handle: z.string().optional().or(z.literal('')),
  whatsapp_id: z.string().optional().or(z.literal('')),
  facebook_id: z.string().optional().or(z.literal('')),
  trainerize_id: z.string().optional().or(z.literal('')),
  wechat_id: z.string().optional().or(z.literal('')),
});

type EditProfileFormData = z.infer<typeof EditProfileSchema>;

export default function MyProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);

  // Fetch trainer's profile data
  const { data: trainerProfile, isLoading, error } = useQuery({
    queryKey: ['trainerProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('trainers')
        .select(`
          id,
          business_name,
          contact_email,
          phone,
          instagram_handle,
          whatsapp_id,
          facebook_id,
          trainerize_id,
          wechat_id,
          created_at,
          updated_at
        `)
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching trainer profile:", error);
        throw error;
      }
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // React Hook Form initialization
  const form = useForm<EditProfileFormData>({
    resolver: zodResolver(EditProfileSchema),
    defaultValues: {
      contact_email: (trainerProfile as any)?.contact_email || '',
      phone: (trainerProfile as any)?.phone || '',
      instagram_handle: (trainerProfile as any)?.instagram_handle || '',
      whatsapp_id: (trainerProfile as any)?.whatsapp_id || '',
      facebook_id: (trainerProfile as any)?.facebook_id || '',
      trainerize_id: (trainerProfile as any)?.trainerize_id || '',
      wechat_id: (trainerProfile as any)?.wechat_id || '',
    },
    mode: 'onChange'
  });

  // Reset form defaults when trainerProfile data or edit mode changes
  useEffect(() => {
    if (trainerProfile && !isEditing) {
      form.reset({
        contact_email: (trainerProfile as any).contact_email || '',
        phone: (trainerProfile as any).phone || '',
        instagram_handle: (trainerProfile as any).instagram_handle || '',
        whatsapp_id: (trainerProfile as any).whatsapp_id || '',
        facebook_id: (trainerProfile as any).facebook_id || '',
        trainerize_id: (trainerProfile as any).trainerize_id || '',
        wechat_id: (trainerProfile as any).wechat_id || '',
      });
    }
  }, [trainerProfile, isEditing, form]);

  const onSubmit = async (data: EditProfileFormData) => {
    if (!user?.id || !(trainerProfile as any)?.id) {
      toast({ title: 'Error', description: 'User or profile ID missing.', variant: 'destructive' });
      return;
    }

    try {
      const payload = {
        contact_email: data.contact_email || null,
        phone: data.phone || null,
        instagram_handle: data.instagram_handle || null,
        whatsapp_id: data.whatsapp_id || null,
        facebook_id: data.facebook_id || null,
        trainerize_id: data.trainerize_id || null,
        wechat_id: data.wechat_id || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('trainers')
        .update(payload)
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Profile updated successfully!',
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['trainerProfile', user.id] });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: 'Error',
        description: `Failed to update profile: ${error.message || 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading profile...</span>
          </div>
        </main>
      </div>
    );
  }

  if (error || !trainerProfile) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <p className="text-red-500">Error loading profile or profile not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-heading-1">My Profile</h1>
          {!isEditing && (
            <Button onClick={() => setIsEditing(true)} variant="outline" className="flex items-center gap-2">
              <Edit className="w-4 h-4" /> Edit Profile
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Contact Information Card */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <div className="space-y-3">
                    {/* Business Name (Always Read-Only) */}
                    <p><strong>Business Name:</strong> {(trainerProfile as any).business_name || 'N/A'}</p>

                    {/* Email */}
                    <FormField
                      control={form.control}
                      name="contact_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center"><Mail className="w-4 h-4 mr-2 text-muted-foreground" /> Email</FormLabel>
                          <FormControl>
                            {isEditing ? (
                              <Input {...field} placeholder="your@email.com" />
                            ) : (
                              <p className="font-medium">{(trainerProfile as any).contact_email || 'N/A'}</p>
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Phone */}
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center"><Phone className="w-4 h-4 mr-2 text-muted-foreground" /> Phone</FormLabel>
                          <FormControl>
                            {isEditing ? (
                              <Input {...field} placeholder="+61412345678" />
                            ) : (
                              <p className="font-medium">{(trainerProfile as any).phone || 'N/A'}</p>
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="pt-4 border-t mt-4">
                    <h3 className="text-md font-semibold mb-2">Messaging Handles</h3>
                    <div className="space-y-2">
                      {/* Instagram */}
                      <FormField
                        control={form.control}
                        name="instagram_handle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center"><Instagram className="w-4 h-4 mr-2 text-muted-foreground" /> Instagram</FormLabel>
                            <FormControl>
                              {isEditing ? (
                                <Input {...field} placeholder="@your_handle" />
                              ) : (
                                <p className="font-medium">{(trainerProfile as any).instagram_handle || 'N/A'}</p>
                              )}
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {/* WhatsApp */}
                      <FormField
                        control={form.control}
                        name="whatsapp_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center"><MessageCircle className="w-4 h-4 mr-2 text-muted-foreground" /> WhatsApp ID</FormLabel>
                            <FormControl>
                              {isEditing ? (
                                <Input {...field} placeholder="e.g., +61412345678" />
                              ) : (
                                <p className="font-medium">{(trainerProfile as any).whatsapp_id || 'N/A'}</p>
                              )}
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {/* Facebook */}
                      <FormField
                        control={form.control}
                        name="facebook_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center"><Facebook className="w-4 h-4 mr-2 text-muted-foreground" /> Facebook ID</FormLabel>
                            <FormControl>
                              {isEditing ? (
                                <Input {...field} placeholder="e.g., your_facebook_profile_id" />
                              ) : (
                                <p className="font-medium">{(trainerProfile as any).facebook_id || 'N/A'}</p>
                              )}
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {/* Trainerize */}
                      <FormField
                        control={form.control}
                        name="trainerize_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center"><Link2 className="w-4 h-4 mr-2 text-muted-foreground" /> Trainerize ID</FormLabel>
                            <FormControl>
                              {isEditing ? (
                                <Input {...field} placeholder="e.g., your_trainerize_username" />
                              ) : (
                                <p className="font-medium">{(trainerProfile as any).trainerize_id || 'N/A'}</p>
                              )}
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {/* WeChat */}
                      <FormField
                        control={form.control}
                        name="wechat_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center"><MessageCircle className="w-4 h-4 mr-2 text-muted-foreground" /> WeChat ID</FormLabel>
                            <FormControl>
                              {isEditing ? (
                                <Input {...field} placeholder="e.g., your_wechat_id" />
                              ) : (
                                <p className="font-medium">{(trainerProfile as any).wechat_id || 'N/A'}</p>
                              )}
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex justify-end space-x-2 pt-4 border-t">
                      <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={form.formState.isSubmitting}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isValid}>
                        {form.formState.isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                          </>
                        ) : "Save Changes"}
                      </Button>
                    </div>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Related Links & Tools Card */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Link2 className="w-5 h-5 mr-2" />
                Related Links & Tools
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button asChild className="w-full">
                <Link to="/schedule/availability">Manage Availability</Link>
              </Button>
              <Button asChild className="w-full">
                <Link to="/settings/service-types">My Services</Link>
              </Button>
              <Button className="w-full" disabled>
                <Upload className="w-4 h-4 mr-2" />
                Batch Client Upload (Future)
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}