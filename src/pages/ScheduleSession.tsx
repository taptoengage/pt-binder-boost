import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import UniversalSessionModal from '@/components/UniversalSessionModal';

export default function ScheduleSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  // Get optional clientId from URL params
  const clientId = searchParams.get('clientId') || undefined;
  
  // Local state for client selection
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(clientId);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  // Load trainer's clients
  useEffect(() => {
    if (!user?.id) return;
    
    (async () => {
      try {
        setLoadingClients(true);
        const { data, error } = await supabase
          .from('clients')
          .select('id, name')
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
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Select a client and schedule a new session.
            </p>
          </CardContent>
        </Card>

        {/* Trainer-only Client Picker */}
        {user?.id && (
          <div className="max-w-4xl mx-auto mt-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Select Client</label>
              <Select
                value={selectedClientId ?? ''}
                onValueChange={(v) => setSelectedClientId(v)}
                disabled={loadingClients || clients.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingClients ? 'Loading clients…' : 'Choose a client'} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {!selectedClientId && (
          <p className="max-w-4xl mx-auto mt-4 text-sm text-muted-foreground">
            Please select a client to proceed with booking.
          </p>
        )}

        {/* Universal Session Modal */}
        <UniversalSessionModal
          mode="book"
          isOpen={true}
          onClose={handleCancel}
          clientId={selectedClientId}
          trainerId={user?.id}
          onSessionUpdated={handleSuccess}
        />
      </div>
    </div>
  );
}