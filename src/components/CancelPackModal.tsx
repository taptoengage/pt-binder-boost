import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type SessionPack = Database['public']['Tables']['session_packs']['Row'];
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

interface CancelPackModalProps {
  pack: SessionPack | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSuccess: () => void; // To refetch data on the parent page
}

export function CancelPackModal({ pack, isOpen, onOpenChange, onSuccess }: CancelPackModalProps) {
  const [cancellationType, setCancellationType] = useState<'forfeit' | 'refund' | ''>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCancelPack = async () => {
    if (!pack) return;
    if (!cancellationType) {
      setError('Please select a cancellation type (Forfeit or Refund).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: functionError } = await supabase.functions.invoke('cancel-session-pack', {
        body: {
          packId: pack.id,
          cancellationType,
          notes,
        },
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      toast({
        title: 'Success!',
        description: `The pack has been successfully cancelled and archived.`,
      });
      onSuccess(); // Trigger parent component to refetch data
      onOpenChange(false); // Close the modal
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred.';
      setError(errorMessage);
      toast({
        title: 'Error Cancelling Pack',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset state when modal is closed
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCancellationType('');
      setNotes('');
      setError(null);
      setIsSubmitting(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Cancel Session Pack</DialogTitle>
          <DialogDescription>
            You are about to cancel this pack. This action cannot be undone. All {pack?.sessions_remaining} remaining sessions will be processed as selected below.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Cancellation Method</Label>
            <RadioGroup value={cancellationType} onValueChange={(value) => setCancellationType(value as 'forfeit' | 'refund')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="forfeit" id="forfeit" />
                <Label htmlFor="forfeit">Forfeit Remaining Sessions</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="refund" id="refund" />
                <Label htmlFor="refund">Refund Remaining Sessions (Credit Note)</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Cancellation Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="e.g., Client moving away, refund agreed upon."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && (
             <Alert variant="destructive">
               <Terminal className="h-4 w-4" />
               <AlertDescription>{error}</AlertDescription>
             </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleCancelPack} disabled={isSubmitting || !cancellationType}>
            {isSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}