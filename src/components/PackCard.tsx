import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { usePackSessionStats } from '@/hooks/usePackSessionStats';
import { Loader2 } from 'lucide-react';

interface SessionPack {
  id: string;
  total_sessions: number;
  sessions_remaining: number;
  service_type_id: string;
  service_types: { name: string } | null;
  amount_paid: number;
  purchase_date: string;
  expiry_date: string | null;
  status: string;
}

interface PackCardProps {
  pack: SessionPack;
  clientId: string;
  trainerId: string;
  onClick: () => void;
}

export function PackCard({ pack, clientId, trainerId, onClick }: PackCardProps) {
  const { data: packStats, isLoading } = usePackSessionStats(pack.id, clientId, trainerId);

  if (isLoading) {
    return (
      <Card className="cursor-pointer hover:shadow-md transition-shadow">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const { scheduledCount, consumedCount, totalUsedOrScheduled } = packStats || {
    scheduledCount: 0,
    consumedCount: 0,
    totalUsedOrScheduled: 0,
  };

  const sessionsAvailableToBook = pack.total_sessions - totalUsedOrScheduled;
  const progressPercentage = (totalUsedOrScheduled / pack.total_sessions) * 100;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {pack.service_types?.name || 'Unknown Service'} - {pack.total_sessions} Pack
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Sessions Progress</span>
            <span className="text-sm font-medium">
              {Math.max(0, sessionsAvailableToBook)} / {pack.total_sessions} available to book
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
        
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Used:</span>
          <span className="font-medium">{totalUsedOrScheduled} sessions</span>
        </div>
        
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{scheduledCount} Scheduled</span>
          <span>{consumedCount} Completed</span>
        </div>
        
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Value:</span>
          <span className="font-medium">${pack.amount_paid.toFixed(2)}</span>
        </div>
        
        {pack.expiry_date && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Expires:</span>
            <span className="font-medium">{format(new Date(pack.expiry_date), 'dd/MM/yyyy')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}