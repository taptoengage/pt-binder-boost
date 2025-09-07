import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface CancellationPenaltyModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
  onSessionCancelled: () => void;
}

export default function CancellationPenaltyModal({
  isOpen,
  onClose,
  session,
  onSessionCancelled,
}: CancellationPenaltyModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const { toast } = useToast();

  const handleConfirmPenalty = () => {
    setIsConfirming(true);
  };

  const handleCancelSession = async () => {
    if (!session?.id) return;
    
    setIsCancelling(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      console.log('Invoking cancel-client-session (penalize) for', session.id);
      const { data, error } = await supabase.functions.invoke('cancel-client-session', {
        body: { sessionId: session.id, penalize: true },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (error) throw error;
      
      toast({
        title: 'Session Cancelled',
        description: 'Your session has been cancelled with penalty applied.',
        variant: 'default',
      });
      
      onSessionCancelled();
      onClose();
    } catch (error: any) {
      console.error('Error cancelling session:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel session. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleBackToWarning = () => {
    setIsConfirming(false);
  };

  const handleModalClose = () => {
    if (!isCancelling) {
      setIsConfirming(false);
      onClose();
    }
  };

  if (!session) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleModalClose}>
      <DialogContent className="sm:max-w-md">
        {!isConfirming ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Cancellation Penalty
              </DialogTitle>
              <DialogDescription className="space-y-3 pt-2">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>
                    Session: {format(new Date(session.session_date), 'EEEE, MMM dd, yyyy at h:mm a')}
                  </span>
                </div>
                
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm font-medium text-destructive mb-2">
                    ⚠️ Late Cancellation Penalty
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Since this session is within 24 hours of its start time, cancelling will result in:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 ml-4 space-y-1">
                    <li>• No refund of session credit or pack session</li>
                    <li>• Session will be marked as a no-show</li>
                    <li>• This helps maintain fair scheduling for all clients</li>
                  </ul>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to proceed with cancelling this session?
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>
                Keep Session
              </Button>
              <Button variant="destructive" onClick={handleConfirmPenalty}>
                Yes, Cancel Session
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Final Confirmation
              </DialogTitle>
              <DialogDescription className="space-y-3 pt-2">
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm font-medium text-destructive mb-2">
                    This action cannot be undone
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your session on {format(new Date(session.session_date), 'EEEE, MMM dd, yyyy at h:mm a')} will be permanently cancelled with penalty applied.
                  </p>
                </div>
                
                <p className="text-sm font-medium">
                  Select "Confirm Cancellation" to confirm this irreversible action.
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleBackToWarning} disabled={isCancelling}>
                Go Back
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleCancelSession}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Cancelling...
                  </>
                ) : (
                  'Confirm Cancellation'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}