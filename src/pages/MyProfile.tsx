import React from 'react';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { User, Phone, Mail, Instagram, Facebook, MessageCircle, Link2, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MyProfile() {
  const { user } = useAuth();

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <p>Loading profile...</p>
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
        <h1 className="text-heading-1 mb-6">My Profile</h1>

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
              <p><strong>Business Name:</strong> {(trainerProfile as any).business_name || 'N/A'}</p>
              <p className="flex items-center"><Mail className="w-4 h-4 mr-2 text-muted-foreground" /> <strong>Email:</strong> {(trainerProfile as any).contact_email || 'N/A'}</p>
              <p className="flex items-center"><Phone className="w-4 h-4 mr-2 text-muted-foreground" /> <strong>Phone:</strong> {(trainerProfile as any).phone || 'N/A'}</p>

              <div className="pt-4 border-t mt-4">
                <h3 className="text-md font-semibold mb-2">Messaging Handles</h3>
                <div className="space-y-2">
                  <p className="flex items-center"><Instagram className="w-4 h-4 mr-2 text-muted-foreground" /> <strong>Instagram:</strong> {(trainerProfile as any).instagram_handle || 'N/A'}</p>
                  <p className="flex items-center"><MessageCircle className="w-4 h-4 mr-2 text-muted-foreground" /> <strong>WhatsApp:</strong> {(trainerProfile as any).whatsapp_id || 'N/A'}</p>
                  <p className="flex items-center"><Facebook className="w-4 h-4 mr-2 text-muted-foreground" /> <strong>Facebook:</strong> {(trainerProfile as any).facebook_id || 'N/A'}</p>
                  <p className="flex items-center"><Link2 className="w-4 h-4 mr-2 text-muted-foreground" /> <strong>Trainerize:</strong> {(trainerProfile as any).trainerize_id || 'N/A'}</p>
                  <p className="flex items-center"><MessageCircle className="w-4 h-4 mr-2 text-muted-foreground" /> <strong>WeChat:</strong> {(trainerProfile as any).wechat_id || 'N/A'}</p>
                </div>
              </div>
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