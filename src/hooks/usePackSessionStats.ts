import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PackSessionStats {
  packId: string;
  scheduledCount: number;
  consumedCount: number;
  totalUsedOrScheduled: number;
}

export function usePackSessionStats(packId: string, clientId: string, trainerId: string) {
  return useQuery({
    queryKey: ['packSessionStats', packId, clientId, trainerId],
    queryFn: async (): Promise<PackSessionStats> => {
      if (!packId || !clientId || !trainerId) {
        return {
          packId,
          scheduledCount: 0,
          consumedCount: 0,
          totalUsedOrScheduled: 0,
        };
      }

      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('status, cancellation_reason')
        .eq('session_pack_id', packId)
        .eq('client_id', clientId)
        .eq('trainer_id', trainerId);

      if (error) {
        console.error('Error fetching pack session stats:', error);
        return {
          packId,
          scheduledCount: 0,
          consumedCount: 0,
          totalUsedOrScheduled: 0,
        };
      }

      const scheduledCount = sessions?.filter(s => s.status === 'scheduled').length || 0;
      
      const consumedCount = sessions?.filter(s => 
        s.status === 'completed' || 
        s.status === 'no-show' ||
        s.status === 'cancelled_early' ||
        (s.status === 'cancelled' && s.cancellation_reason === 'penalty')
      ).length || 0;

      const totalUsedOrScheduled = scheduledCount + consumedCount;

      return {
        packId,
        scheduledCount,
        consumedCount,
        totalUsedOrScheduled,
      };
    },
    enabled: !!packId && !!clientId && !!trainerId,
  });
}