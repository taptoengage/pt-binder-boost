import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface SessionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any; // TODO: Replace 'any' with proper Session type
}

export default function SessionDetailModal({ isOpen, onClose, session }: SessionDetailModalProps) {
  if (!isOpen || !session) return null; // Don't render if not open or no session

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] md:max-w-md">
        <DialogHeader>
          <DialogTitle>Session Details</DialogTitle>
          <DialogDescription>
            Information about this scheduled session.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <p><strong>Client:</strong> {session.clients?.name || 'N/A'}</p>
          <p><strong>Service:</strong> {session.service_types?.name || 'N/A'}</p>
          <p><strong>Date:</strong> {format(new Date(session.session_date), 'PPP')}</p>
          <p><strong>Time:</strong> {format(new Date(session.session_date), 'p')}</p>
          <p>
            <strong>Status:</strong>{" "}
            <Badge className={cn(
              { 'bg-green-500': session.status === 'scheduled' },
              { 'bg-gray-500': session.status === 'completed' },
              { 'bg-red-500': session.status === 'cancelled' || session.status === 'cancelled_late' },
              { 'bg-orange-500': session.status === 'cancelled_early' }
            )}>
              {session.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </Badge>
          </p>
          {session.notes && (
            <p><strong>Notes:</strong> {session.notes}</p>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-2">
          <Button variant="outline" className="mb-2 sm:mb-0">Edit Session (Placeholder)</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}