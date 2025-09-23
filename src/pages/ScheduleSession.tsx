import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import UniversalSessionModal from '@/components/UniversalSessionModal';

type MinimalClient = { id: string; name: string | null; email: string | null };

export default function ScheduleSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  // Get optional clientId from URL params
  const clientId = searchParams.get('clientId') || undefined;
  
  // Local state for client selection
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(clientId || undefined);
  const [clients, setClients] = useState<MinimalClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const isTrainer = !!user;

  // Load trainer's clients
  useEffect(() => {
    if (!user?.id) return;
    
    (async () => {
      try {
        setLoadingClients(true);
        const { data, error } = await supabase
          .from('clients')
          .select('id, name, email')
          .eq('trainer_id', user.id)
          .order('name', { ascending: true });

        if (error) throw error;
        setClients(data || []);
      } catch (e) {
        console.error('Failed to load clients:', e);
      } finally {
        setLoadingClients(false);
      }
    })();
  }, [user?.id]);

  // Validate URL clientId belongs to this trainer
  useEffect(() => {
    if (!clientId) return;
    if (!clients.length) return;
    const valid = clients.some(c => c.id === clientId);
    setSelectedClientId(valid ? clientId : undefined);
  }, [clientId, clients]);

  const handleClientChange = (value: string) => {
    setSelectedClientId(value);
  };

  const handleSuccess = () => {
    toast({
      title: 'Success',
      description: 'Session scheduled successfully',
    });
    navigate('/schedule');
  };

  const handleCancel = () => {
    navigate('/schedule');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/schedule')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Schedule
          </Button>
        </div>

        {/* Main Content Card */}
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>Schedule a Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isTrainer && (
              <div className="space-y-2">
                <Label>Select Client</Label>
                <Select value={selectedClientId ?? ''} onValueChange={handleClientChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loadingClients ? 'Loading clients...' : 'Choose a client'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px] overflow-y-auto">
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name || c.email || c.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedClientId && (
                  <p className="text-muted-foreground text-sm">
                    Please select a client to proceed with booking.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Universal Session Modal */}
        <UniversalSessionModal
          mode="book"
          isOpen={!!selectedClientId}
          onClose={handleCancel}
          clientId={selectedClientId}
          trainerId={user?.id}
          onSessionUpdated={handleSuccess}
        />
      </div>
    </div>
  );
}