import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface SubscriptionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: any; // TODO: Replace 'any' with proper Subscription type
}

export default function SubscriptionDetailModal({ isOpen, onClose, subscription }: SubscriptionDetailModalProps) {
  if (!subscription) return null; // Don't render if no subscription is passed

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] md:max-w-xl lg:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Subscription Details</DialogTitle>
          <DialogDescription>
            View and manage the details of this client's subscription.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <p><strong>Subscription ID:</strong> {subscription.id}</p>
          <p><strong>Billing Cycle:</strong> {subscription.billing_cycle}</p>
          <p><strong>Start Date:</strong> {format(new Date(subscription.start_date), 'PPP')}</p>
          {subscription.end_date && (
            <p><strong>End Date:</strong> {format(new Date(subscription.end_date), 'PPP')}</p>
          )}
          {subscription.billing_amount && (
            <p><strong>Billing Amount:</strong> {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(subscription.billing_amount)} per {subscription.billing_cycle}</p>
          )}

          <h3 className="text-lg font-semibold mt-4">Services Included:</h3>
          {subscription.subscription_service_allocations && subscription.subscription_service_allocations.length > 0 ? (
            <ul className="list-disc pl-5 space-y-1">
              {subscription.subscription_service_allocations.map((alloc: any) => (
                <li key={alloc.service_type_id}>
                  {alloc.service_types?.name || 'Unknown Service'}: {alloc.quantity_per_period} per {alloc.period_type}
                </li>
              ))}
            </ul>
          ) : (
            <p>No services allocated for this subscription.</p>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-2">
          <Button variant="outline" className="mb-2 sm:mb-0">Edit Subscription (Placeholder)</Button>
          <Button variant="destructive" className="mb-2 sm:mb-0">Cancel Subscription (Placeholder)</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}