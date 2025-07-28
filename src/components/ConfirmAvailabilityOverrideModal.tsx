import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface ConfirmAvailabilityOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  proposedDateTime: Date; // The combined date and time of the session
}

export default function ConfirmAvailabilityOverrideModal({
  isOpen,
  onClose,
  onConfirm,
  proposedDateTime,
}: ConfirmAvailabilityOverrideModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Confirm Booking Outside Availability</DialogTitle>
          <DialogDescription>
            You are attempting to book a session on{" "}
            <strong>{format(proposedDateTime, 'PPP')} at {format(proposedDateTime, 'p')}</strong>,
            which falls outside your defined standard availability.
            Are you sure you want to proceed?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-end sm:space-x-2 mt-4">
          <Button variant="outline" onClick={onClose} className="mb-2 sm:mb-0">
            Cancel
          </Button>
          <Button onClick={onConfirm} className="mb-2 sm:mb-0">
            Confirm Booking Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}