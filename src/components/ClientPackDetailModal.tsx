import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Clock, Calendar, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

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

interface LinkedSession {
  id: string;
  session_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  cancellation_reason: string | null;
}

interface ClientPackDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pack: SessionPack | null;
}

const ClientPackDetailModal: React.FC<ClientPackDetailModalProps> = ({ isOpen, onClose, pack }) => {
  // Fetch sessions linked to this pack
  const { data: linkedSessions, isLoading: isLoadingLinkedSessions, error: linkedSessionsError } = useQuery({
    queryKey: ['linkedSessions', pack?.id],
    queryFn: async () => {
      if (!pack?.id) return [];
      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_date, status, notes, created_at, cancellation_reason')
        .eq('session_pack_id', pack.id)
        .order('session_date', { ascending: false });

      if (error) throw error;
      return data as LinkedSession[];
    },
    enabled: !!pack?.id && isOpen,
  });

  if (!pack) return null;

  // Calculate accurate consumed sessions including penalty cancellations
  const consumedSessions = linkedSessions?.filter(s => 
    s.status === 'completed' || 
    s.status === 'no-show' ||
    (s.status === 'cancelled' && s.cancellation_reason === 'penalty')
  ).length || 0;
  
  const scheduledSessions = linkedSessions?.filter(s => s.status === 'scheduled').length || 0;
  const totalUsedSessions = consumedSessions + scheduledSessions;
  const progressPercentage = (totalUsedSessions / pack.total_sessions) * 100;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'scheduled':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {pack.service_types?.name || 'Unknown Service'} - {pack.total_sessions} Session Pack
          </DialogTitle>
          <DialogDescription>
            Detailed overview of sessions consumed and scheduled for this pack.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Pack Overview */}
          <div className="space-y-2 mb-4">
            <p className="text-xs text-muted-foreground">Pack ID: {pack.id}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Sessions Progress</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Used: {totalUsedSessions}</span>
                    <span>Remaining: {Math.max(0, pack.total_sessions - totalUsedSessions)}</span>
                  </div>
                  <Progress value={progressPercentage} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {progressPercentage.toFixed(1)}% of sessions used
                  </p>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Sessions</h3>
                <p className="text-2xl font-bold">{pack.total_sessions}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Amount Paid</h3>
                <p className="text-2xl font-bold">${pack.amount_paid.toFixed(2)}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Purchase Date</h3>
                {pack.purchase_date ? (
                  <p className="text-sm">{format(new Date(pack.purchase_date), 'dd/MM/yyyy')}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not specified</p>
                )}
              </div>
              
              {pack.expiry_date && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Expiry Date</h3>
                  <p className="text-sm">{format(new Date(pack.expiry_date), 'dd/MM/yyyy')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Linked Sessions */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Session History
            </h3>
            
            {isLoadingLinkedSessions && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-muted-foreground">Loading sessions...</span>
              </div>
            )}
            
            {linkedSessionsError && (
              <div className="text-center py-8">
                <p className="text-red-500 text-sm">Error loading sessions: {linkedSessionsError.message}</p>
              </div>
            )}
            
            {linkedSessions && linkedSessions.length === 0 && !isLoadingLinkedSessions && (
              <div className="text-center py-8">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No sessions linked to this pack yet.</p>
              </div>
            )}

            {linkedSessions && linkedSessions.length > 0 && (
              <div className="space-y-3">
                {linkedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(session.status)}
                      <div>
                        <p className="font-medium">
                          {session.session_date ? format(new Date(session.session_date), 'EEE, MMM dd, yyyy') : 'Date not specified'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {session.session_date ? format(new Date(session.session_date), 'h:mm a') : ''}
                        </p>
                        {session.notes && (
                          <p className="text-xs text-muted-foreground mt-1 max-w-md truncate">
                            Notes: {session.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-md border ${getStatusStyle(session.status)}`}>
                        {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                        {session.status === 'cancelled' && session.cancellation_reason === 'penalty' && (
                          <span className="ml-1 font-bold text-red-500">(Penalty)</span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClientPackDetailModal;