import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import CreditDecisionModal from './CreditDecisionModal';

// Define Zod Schema for editing
const EditSubscriptionSchema = z.object({
  status: z.enum(['active', 'paused', 'ended', 'cancelled'], {
    message: "Status is required."
  }),
  end_date: z.date().nullable().optional(),
});

type EditSubscriptionFormData = z.infer<typeof EditSubscriptionSchema>;

interface SubscriptionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: any; // TODO: Replace 'any' with proper Subscription type
  onUpdate: () => void;
}

export default function SubscriptionDetailModal({ isOpen, onClose, subscription, onUpdate }: SubscriptionDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCreditDecision, setShowCreditDecision] = useState(false);
  const [intendedSubscriptionStatus, setIntendedSubscriptionStatus] = useState<'ended' | 'cancelled' | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<EditSubscriptionFormData>({
    resolver: zodResolver(EditSubscriptionSchema),
    defaultValues: {
      status: subscription?.status || 'active',
      end_date: subscription?.end_date ? new Date(subscription.end_date) : null,
    },
    mode: 'onChange'
  });

  // Fetch available credits for this subscription
  const { data: availableCredits, isLoading: isLoadingAvailableCredits } = useQuery({
      queryKey: ['availableCreditsForSubscription', subscription?.id],
      queryFn: async () => {
          if (!subscription?.id) return [];
          const { data, error } = await supabase
              .from('subscription_session_credits')
              .select('id') // Just need IDs to count
              .eq('subscription_id', subscription.id)
              .eq('status', 'available'); // Only count available credits

          if (error) throw error;
          return data || [];
      },
      enabled: !!subscription?.id && !isEditing && isOpen, // Only fetch when modal is open and not editing
      staleTime: 0, // Always get fresh count
  });

  const availableCreditsCount = availableCredits?.length || 0;

  // Reset form when modal opens or subscription changes
  useEffect(() => {
    if (isOpen && subscription) {
      form.reset({
        status: subscription.status || 'active',
        end_date: subscription.end_date ? new Date(subscription.end_date) : null,
      });
      setIsEditing(false);
    }
  }, [isOpen, subscription, form]);

  // Helper function to proceed with subscription update after credit decision
  const proceedWithSubscriptionUpdate = async (status: 'ended' | 'cancelled') => {
    try {
      const payload = {
        status: status,
        end_date: new Date().toISOString().split('T')[0],
      };

      const { error } = await supabase
        .from('client_subscriptions')
        .update(payload)
        .eq('id', subscription.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Subscription ${status} successfully!`,
      });
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error("Error updating subscription status:", error);
      toast({
        title: 'Error',
        description: `Failed to update subscription status: ${error.message || 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const onSubmit = async (data: EditSubscriptionFormData) => {
    if (data.status === 'ended' || data.status === 'cancelled') {
      if (availableCreditsCount > 0) {
        setIntendedSubscriptionStatus(data.status);
        setShowCreditDecision(true);
        return; // STOP HERE, decision modal will handle next step
      }
    }
    
    // If no credits, or status is not ended/cancelled, proceed normally
    try {
      const payload = {
        status: data.status,
        end_date: data.end_date ? data.end_date.toISOString().split('T')[0] : null,
      };

      const { error } = await supabase
        .from('client_subscriptions')
        .update(payload)
        .eq('id', subscription.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Subscription updated successfully!',
      });
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error("Error updating subscription:", error);
      toast({
        title: 'Error',
        description: `Failed to update subscription: ${error.message || 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const onConfirmCancel = async () => {
    setShowCancelConfirm(false); // Close confirmation dialog immediately
    if (!subscription?.id) {
      toast({
        title: 'Error',
        description: 'Subscription ID is missing for cancellation.',
        variant: 'destructive',
      });
      return;
    }

    if (availableCreditsCount > 0) {
      setIntendedSubscriptionStatus('cancelled');
      setShowCreditDecision(true);
      return; // STOP HERE, decision modal will handle next step
    }

    // If no credits, proceed with cancellation
    await proceedWithSubscriptionUpdate('cancelled');
  };

  // Handle Forfeit Credits
  const handleForfeitCredits = async () => {
    setShowCreditDecision(false); // Close CreditDecisionModal immediately

    if (!subscription?.id) {
      toast({ title: 'Error', description: 'Subscription ID is missing for credit forfeiture.', variant: 'destructive' });
      return;
    }

    try {
      // Get all available credit IDs for this subscription
      const creditIdsToForfeit = availableCredits?.map(credit => credit.id) || [];

      if (creditIdsToForfeit.length === 0) {
        toast({ title: 'Info', description: 'No available credits to forfeit.', variant: 'default' });
      } else {
        // Update status of all these credits to 'forfeited'
        const { error } = await supabase
          .from('subscription_session_credits')
          .update({ status: 'forfeited' })
          .in('id', creditIdsToForfeit);

        if (error) throw error;

        toast({ title: 'Success', description: `Successfully forfeited ${creditIdsToForfeit.length} session credit(s).` });
        queryClient.invalidateQueries({ queryKey: ['availableCreditsForSubscription', subscription.id] });
      }
    } catch (error: any) {
      console.error("Error forfeiting credits:", error);
      toast({ title: 'Error', description: `Failed to forfeit credits: ${error.message || 'Unknown error'}`, variant: 'destructive' });
    } finally {
      // ALWAYS proceed with subscription update after credit decision
      if (intendedSubscriptionStatus) {
        await proceedWithSubscriptionUpdate(intendedSubscriptionStatus);
        setIntendedSubscriptionStatus(null);
      } else {
        toast({ title: 'Error', description: 'Could not determine intended subscription status after credit decision.', variant: 'destructive' });
        onClose();
      }
    }
  };

  // Handle Refund Credits Placeholder
  const handleRefundCreditsPlaceholder = async () => {
    setShowCreditDecision(false); // Close CreditDecisionModal immediately

    toast({
      title: 'Refund Process',
      description: 'Initiating refund for outstanding credits. This feature will be integrated with the Finance module.',
      variant: 'default',
    });

    // After acknowledging refund (for now), proceed with subscription update
    if (intendedSubscriptionStatus) {
      await proceedWithSubscriptionUpdate(intendedSubscriptionStatus);
      setIntendedSubscriptionStatus(null);
    } else {
      toast({ title: 'Error', description: 'Could not determine intended subscription status after credit decision.', variant: 'destructive' });
      onClose();
    }
  };

  if (!subscription) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] md:max-w-xl lg:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Subscription Details</DialogTitle>
          <DialogDescription>
            {isEditing ? "Edit this client's subscription details." : "View and manage the details of this client's subscription."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="py-4 space-y-4">
            <p><strong>Subscription ID:</strong> {subscription.id}</p>
            <p><strong>Billing Cycle:</strong> {subscription.billing_cycle}</p>
            <p><strong>Start Date:</strong> {format(new Date(subscription.start_date), 'PPP')}</p>
            {subscription.billing_amount && (
              <p><strong>Billing Amount:</strong> {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(subscription.billing_amount)} per {subscription.billing_cycle}</p>
            )}

            {/* Status Field */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  {isEditing ? (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="ended">Ended</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm font-medium">{field.value ? field.value.charAt(0).toUpperCase() + field.value.slice(1) : 'N/A'}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* End Date Field */}
            <FormField
              control={form.control}
              name="end_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>End Date (Optional)</FormLabel>
                  {isEditing ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date or leave empty</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={(date) => field.onChange(date || null)}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                        <div className="p-2">
                          <Button variant="ghost" onClick={() => field.onChange(null)} className="w-full">
                            Clear Date
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <p className="text-sm font-medium">{field.value ? format(field.value, 'PPP') : 'N/A'}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-2 mt-6">
              {isEditing ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)} className="mb-2 sm:mb-0">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isValid} className="mb-2 sm:mb-0">
                    {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setIsEditing(true)} className="mb-2 sm:mb-0">
                    Edit Subscription
                  </Button>
                  
                  {/* Cancel Subscription Button with Confirmation */}
                   <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                     <AlertDialogTrigger asChild>
                       <Button type="button" variant="destructive" className="mb-2 sm:mb-0" disabled={isLoadingAvailableCredits}>
                         Cancel Subscription
                       </Button>
                     </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will cancel the subscription immediately and set its end date to today.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onConfirmCancel}>Continue</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Button type="button" onClick={onClose} className="mb-2 sm:mb-0">Close</Button>
                </>
              )}
            </DialogFooter>
          </form>
        </Form>

        {/* CreditDecisionModal */}
        <CreditDecisionModal
          isOpen={showCreditDecision}
          onClose={() => {
            setShowCreditDecision(false);
            if (intendedSubscriptionStatus) {
              toast({ title: 'Warning', description: 'Subscription status change not confirmed without credit decision.', variant: 'destructive' });
              onClose();
              setIntendedSubscriptionStatus(null);
            }
          }}
          availableCreditsCount={availableCreditsCount}
          onForfeit={handleForfeitCredits}
          onRefundPlaceholder={handleRefundCreditsPlaceholder}
        />
      </DialogContent>
    </Dialog>
  );
}