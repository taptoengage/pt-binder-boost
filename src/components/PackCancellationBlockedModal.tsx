import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PackCancellationBlockedModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PackCancellationBlockedModal({
  isOpen,
  onOpenChange,
}: PackCancellationBlockedModalProps) {
  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Cancellation Blocked</DialogTitle>
          <DialogDescription>
            Pack unable to be cancelled due to existing sessions still SCHEDULED. Please 'cancel' or 'complete' these sessions to cancel this pack.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}