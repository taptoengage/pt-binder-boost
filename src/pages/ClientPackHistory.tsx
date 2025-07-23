import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ClientPackDetailModal from '@/components/ClientPackDetailModal';
import { format } from 'date-fns';
import { ArrowLeft, Package, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { DashboardNavigation } from '@/components/Navigation';

// Define the type for a client pack as it's fetched from Supabase
interface ClientPack {
  id: string;
  total_sessions: number;
  sessions_remaining: number;
  service_type_id: string;
  purchase_date: string;
  created_at: string;
  amount_paid: number;
  expiry_date: string | null;
  status: string;
  service_types: { name: string } | null;
}

const ClientPackHistoryPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State to manage the pack detail modal
  const [isPackDetailModalOpen, setIsPackDetailModalOpen] = useState(false);
  const [selectedPackForDetail, setSelectedPackForDetail] = useState<ClientPack | null>(null);

  // Fetch ALL client packs for the given client_id
  const { data: allClientPacks, isLoading: isLoadingAllClientPacks, error: allClientPacksError } = useQuery({
    queryKey: ['allClientPacks', clientId],
    queryFn: async () => {
      if (!clientId || !user?.id) {
        console.warn("DEBUG: No clientId or user available for fetching allClientPacks.");
        return [];
      }
      const { data, error } = await supabase
        .from('session_packs')
        .select(`
          id,
          total_sessions,
          sessions_remaining,
          service_type_id,
          purchase_date,
          created_at,
          amount_paid,
          expiry_date,
          status,
          service_types(name)
        `)
        .eq('client_id', clientId)
        .eq('trainer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("DEBUG: Error fetching all client packs:", error.message);
        throw error;
      }
      console.log("DEBUG: Fetched all client packs:", data);
      return data as ClientPack[];
    },
    enabled: !!clientId && !!user?.id,
  });

  // Function to handle opening the pack detail modal
  const handleViewPackDetail = (pack: ClientPack) => {
    setSelectedPackForDetail(pack);
    setIsPackDetailModalOpen(true);
    console.log("DEBUG: Opening pack detail modal from history page for pack ID:", pack.id);
  };

  if (!clientId) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNavigation />
        <div className="container mx-auto py-8">
          <p className="text-muted-foreground">Loading client data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      <div className="container mx-auto py-8">
        <Button 
          variant="outline" 
          className="mb-6 flex items-center gap-2" 
          onClick={() => navigate(`/clients/${clientId}`)}
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Client Details
        </Button>
        
        <div className="flex items-center gap-3 mb-6">
          <Package className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Client Pack History</h1>
        </div>

        {isLoadingAllClientPacks && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-lg text-muted-foreground">Loading pack history...</span>
          </div>
        )}
        
        {allClientPacksError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive text-center">
                Error loading pack history: {allClientPacksError.message}
              </p>
            </CardContent>
          </Card>
        )}
        
        {allClientPacks?.length === 0 && !isLoadingAllClientPacks && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center py-8">
                No pack history found for this client.
              </p>
            </CardContent>
          </Card>
        )}

        {allClientPacks && allClientPacks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allClientPacks.map((pack) => (
              <Card
                key={pack.id}
                className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02]"
                onClick={() => handleViewPackDetail(pack)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    {pack.service_types?.name || 'Unknown Service'} - {pack.total_sessions} Pack
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Sessions:</span>
                    <span className="font-semibold">
                      {pack.sessions_remaining} / {pack.total_sessions} remaining
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Value:</span>
                    <span className="font-semibold">${pack.amount_paid.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Created:</span>
                    <span className="text-sm">{format(new Date(pack.created_at), 'dd/MM/yyyy')}</span>
                  </div>
                  
                  {pack.expiry_date && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Expires:</span>
                      <span className="text-sm">{format(new Date(pack.expiry_date), 'dd/MM/yyyy')}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-center pt-2">
                    {pack.sessions_remaining === 0 ? (
                      <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                        Consumed
                      </span>
                    ) : pack.status === 'active' ? (
                      <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                        {pack.status}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Reuse the existing ClientPackDetailModal */}
        <ClientPackDetailModal
          isOpen={isPackDetailModalOpen}
          onClose={() => setIsPackDetailModalOpen(false)}
          pack={selectedPackForDetail}
        />
      </div>
    </div>
  );
};

export default ClientPackHistoryPage;