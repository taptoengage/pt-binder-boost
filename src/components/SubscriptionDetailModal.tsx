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
  const { toast } = useToast();

  const form = useForm<EditSubscriptionFormData>({
    resolver: zodResolver(EditSubscriptionSchema),
    defaultValues: {
      status: subscription?.status || 'active',
      end_date: subscription?.end_date ? new Date(subscription.end_date) : null,
    },
    mode: 'onChange'
  });

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

  const onSubmit = async (data: EditSubscriptionFormData) => {
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
                  <Button type="button" variant="destructive" className="mb-2 sm:mb-0" disabled>
                    Cancel Subscription (Next Step)
                  </Button>
                  <Button type="button" onClick={onClose} className="mb-2 sm:mb-0">Close</Button>
                </>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}