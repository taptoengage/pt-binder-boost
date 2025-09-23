import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import UniversalSessionModal from '@/components/UniversalSessionModal';

export default function ScheduleSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  // Get optional clientId from URL params
  const clientId = searchParams.get('clientId') || undefined;

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

        {/* Universal Session Modal */}
        <UniversalSessionModal
          mode="book"
          isOpen={true}
          onClose={handleCancel}
          clientId={clientId}
          trainerId={user?.id}
          onSessionUpdated={handleSuccess}
        />
      </div>
    </div>
  );
}