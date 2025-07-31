import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import ClientBookingCalendar from '@/components/ClientBookingCalendar';

export default function ClientBookSessionPage() {
  const navigate = useNavigate();
  const { client } = useAuth();

  const [isLoadingTrainer, setIsLoadingTrainer] = useState(true);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client?.id && client?.trainer_id) {
      setTrainerId(client.trainer_id);
      setIsLoadingTrainer(false);
    } else if (client && !client.trainer_id) {
      setError("You are not currently linked to a trainer. Please contact your administrator.");
      setIsLoadingTrainer(false);
    }
  }, [client]);

  const handleBackToDashboard = () => {
    navigate('/client/dashboard');
  };

  if (isLoadingTrainer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={handleBackToDashboard}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold">Book Your Next Session</CardTitle>
            <CardDescription>Select an available time slot below.</CardDescription>
          </CardHeader>
          <CardContent>
            {trainerId ? (
              <ClientBookingCalendar trainerId={trainerId} />
            ) : (
              <p className="text-muted-foreground text-destructive">{error || "Unable to display calendar without a linked trainer."}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}