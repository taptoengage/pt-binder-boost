import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CreditDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableCreditsCount: number;
  onForfeit: () => void; // Placeholder for actual forfeit logic
  onRefundPlaceholder: () => void; // Placeholder for refund
}

export default function CreditDecisionModal({ 
  isOpen, 
  onClose, 
  availableCreditsCount, 
  onForfeit, 
  onRefundPlaceholder 
}: CreditDecisionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Outstanding Session Credits</DialogTitle>
          <DialogDescription>
            This subscription has {availableCreditsCount} outstanding session credit{availableCreditsCount !== 1 ? 's' : ''}.
            How would you like to manage them?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <p>Choosing to forfeit will make these credits unusable. Choosing refund will mark them for financial processing.</p>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-end sm:space-x-2">
          <Button variant="destructive" onClick={onForfeit} className="mb-2 sm:mb-0">
            Forfeit Credits
          </Button>
          <Button variant="outline" onClick={onRefundPlaceholder} className="mb-2 sm:mb-0">
            Refund Credits (Future)
          </Button>
          <Button onClick={onClose} className="mb-2 sm:mb-0">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}