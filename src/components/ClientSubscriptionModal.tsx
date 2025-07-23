import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';

interface ServiceAllocation {
  tempId: string; // Unique ID for React list key, not for DB
  serviceTypeId: string;
  quantity: number;
  periodType: 'weekly' | 'monthly';
  costPerSession: number;
  serviceTypeName?: string;
}

interface ClientSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
}

const ServiceAllocationSchema = z.object({
  tempId: z.string().optional(), // tempId is frontend-only
  serviceTypeId: z.string().min(1, { message: "Service type is required." }),
  quantity: z.number().int().min(1, { message: "Quantity must be at least 1." }),
  periodType: z.enum(['weekly', 'monthly'], { message: "Period type is required." }),
  costPerSession: z.number().min(0.01, { message: "Cost per session must be greater than 0." }).refine(val => !isNaN(parseFloat(String(val))), {
    message: "Cost per session must be a valid number.",
  }),
});

const SubscriptionFormSchema = z.object({
  startDate: z.date({
    message: "Start date is required.",
  }),
  billingCycle: z.enum(['weekly', 'fortnightly', 'monthly'], {
    message: "Billing cycle is required.",
  }),
  paymentFrequency: z.enum(['weekly', 'fortnightly', 'monthly'], {
    message: "Payment frequency is required.",
  }),
  servicesIncluded: z.array(ServiceAllocationSchema).min(1, { message: "At least one service must be included." })
    .refine(services => {
      // Additional validation: ensure no duplicate serviceType-periodType combinations
      const uniqueCombinations = new Set();
      for (const service of services) {
        const key = `${service.serviceTypeId}-${service.periodType}`;
        if (uniqueCombinations.has(key)) {
          return false;
        }
        uniqueCombinations.add(key);
      }
      return true;
    }, {
      message: "Duplicate service type/period type combinations are not allowed within a subscription.",
      path: ['servicesIncluded'],
    }),
});

type SubscriptionFormValues = z.infer<typeof SubscriptionFormSchema>;

const ClientSubscriptionModal: React.FC<ClientSubscriptionModalProps> = ({ isOpen, onClose, clientId }) => {
  const queryClient = useQueryClient();

  const form = useForm<SubscriptionFormValues>({
    resolver: zodResolver(SubscriptionFormSchema),
    defaultValues: {
      startDate: new Date(),
      billingCycle: 'monthly',
      paymentFrequency: 'monthly',
      servicesIncluded: [], // Start with an empty array
    },
  });

  // Use form.watch for reactive values
  const startDate = form.watch("startDate");
  const billingCycle = form.watch("billingCycle");
  const paymentFrequency = form.watch("paymentFrequency");
  const servicesIncluded = form.watch("servicesIncluded"); // This is what we'll map over

  // Fetch available service types
  const { data: availableServiceTypes, isLoading: isLoadingServiceTypes, error: serviceTypesError } = useQuery({
    queryKey: ['availableServiceTypes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_types')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) {
        console.error("DEBUG: Error fetching available service types:", error.message);
        throw error;
      }
      console.log("DEBUG: Fetched available service types for modal:", data);
      return data || [];
    }
  });

  // Service management functions
  const handleAddService = () => {
    const currentServices = form.getValues("servicesIncluded");
    form.setValue("servicesIncluded", [
      ...currentServices,
      {
        tempId: crypto.randomUUID(),
        serviceTypeId: '',
        quantity: 1,
        periodType: 'weekly',
        costPerSession: 0,
      },
    ]);
    console.log("DEBUG: Added new service line via React Hook Form.");
  };

  const handleRemoveService = (tempId: string) => {
    form.setValue("servicesIncluded", form.getValues("servicesIncluded").filter((service) => service.tempId !== tempId));
    console.log("DEBUG: Removed service line with tempId:", tempId);
  };

  const handleServiceAllocationChange = (tempId: string, field: keyof Omit<ServiceAllocation, 'tempId' | 'serviceTypeName'>, value: any) => {
    form.setValue("servicesIncluded", form.getValues("servicesIncluded").map((service) =>
        service.tempId === tempId ? { ...service, [field]: value } : service
    ));
    console.log(`DEBUG: Updated service ${tempId} - Field: ${field}, Value: ${value} via React Hook Form.`);
  };

  // Calculate monthly total
  const monthlyTotal = servicesIncluded.reduce((sum, service) => {
    let serviceMonthlyCost = 0;
    // Ensure quantity and costPerSession are numbers before calculation
    const quantity = typeof service.quantity === 'number' ? service.quantity : parseFloat(String(service.quantity)) || 0;
    const costPerSession = typeof service.costPerSession === 'number' ? service.costPerSession : parseFloat(String(service.costPerSession)) || 0;

    if (quantity > 0 && costPerSession > 0) {
      if (service.periodType === 'weekly') {
        serviceMonthlyCost = quantity * costPerSession * 4; // Assume 4 weeks per month
      } else if (service.periodType === 'monthly') {
        serviceMonthlyCost = quantity * costPerSession;
      }
    }
    return sum + serviceMonthlyCost;
  }, 0);

  // Format for display
  const formattedMonthlyTotal = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(monthlyTotal);

  const createSubscriptionMutation = useMutation({
    mutationFn: async (values: SubscriptionFormValues & { billingAmount: number }) => {
      // 1. Insert into client_subscriptions
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('client_subscriptions')
        .insert({
          client_id: clientId,
          trainer_id: (await supabase.auth.getUser()).data.user?.id,
          start_date: format(values.startDate, 'yyyy-MM-dd'),
          billing_cycle: values.billingCycle,
          payment_frequency: values.paymentFrequency,
          billing_amount: values.billingAmount,
          status: 'active', // Default status
        })
        .select()
        .single();

      if (subscriptionError) {
        console.error("DEBUG: Supabase error inserting client_subscription:", subscriptionError);
        throw new Error(`Failed to create subscription: ${subscriptionError.message}`);
      }
      console.log("DEBUG: Client subscription created:", subscriptionData);

      // 2. Prepare service allocations for insertion
      const allocationsToInsert = values.servicesIncluded.map(s => ({
        subscription_id: subscriptionData.id,
        service_type_id: s.serviceTypeId,
        quantity_per_period: s.quantity,
        period_type: s.periodType,
        cost_per_session: s.costPerSession,
      }));

      // 3. Insert into subscription_service_allocations
      const { error: allocationsError } = await supabase
        .from('subscription_service_allocations')
        .insert(allocationsToInsert);

      if (allocationsError) {
        console.error("DEBUG: Supabase error inserting subscription_service_allocations:", allocationsError);
        // Consider a rollback or partial success handling here in a real app
        throw new Error(`Failed to add subscription services: ${allocationsError.message}`);
      }
      console.log("DEBUG: Subscription service allocations created.");

      return subscriptionData; // Return the created subscription data
    },
    onSuccess: () => {
      toast.success("Subscription created successfully!");
      queryClient.invalidateQueries({ queryKey: ['activeClientSubscriptions', clientId] }); // Invalidate query for active subscriptions
      queryClient.invalidateQueries({ queryKey: ['clientPacks', clientId] }); // Also invalidate clientPacks if subscriptions affect that display
      onClose(); // Close the modal
      form.reset(); // Reset the form after successful submission
    },
    onError: (error) => {
      toast.error(`Error creating subscription: ${error.message}`);
      console.error("DEBUG: Subscription creation failed:", error);
    },
  });

  const onSubmit = (values: SubscriptionFormValues) => {
    // Add billingAmount to values before mutation
    const payload = { ...values, billingAmount: monthlyTotal };
    createSubscriptionMutation.mutate(payload);
    console.log("DEBUG: Form submit handler triggered with payload:", payload);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Subscription</DialogTitle>
          <DialogDescription>
            Define the terms and services for this client's recurring subscription.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            {/* Start Date */}
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="start-date" className="text-right">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "col-span-3 justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      form.setValue("startDate", date as Date);
                      form.trigger("startDate");
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Billing Cycle */}
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="billing-cycle" className="text-right">Billing Cycle</label>
              <Select
                value={form.watch("billingCycle")}
                onValueChange={(value) => form.setValue("billingCycle", value as "weekly" | "fortnightly" | "monthly", { shouldValidate: true })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select billing cycle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Frequency */}
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="payment-frequency" className="text-right">Payment Frequency</label>
              <Select
                value={form.watch("paymentFrequency")}
                onValueChange={(value) => form.setValue("paymentFrequency", value as "weekly" | "fortnightly" | "monthly", { shouldValidate: true })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select payment frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Services Included Section */}
            <div className="grid grid-cols-4 items-start gap-4 mt-4">
              <label className="text-right pt-2 font-medium text-gray-700">Services Included</label>
              <div className="col-span-3 space-y-4">
                {servicesIncluded.length === 0 && (
                  <p className="text-gray-500 italic">No services added yet. Click 'Add Service' to begin.</p>
                )}
                {servicesIncluded.map((service) => (
                  <div key={service.tempId} className="flex items-center gap-2 p-3 border rounded-md bg-white shadow-sm relative">
                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1 h-6 w-6 text-red-500 hover:text-red-700 p-0"
                      onClick={() => handleRemoveService(service.tempId)}
                      type="button"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>

                    {/* Service Type Select */}
                    <div className="flex-1">
                      <label htmlFor={`service-type-${service.tempId}`} className="sr-only">Service Type</label>
                      <Select
                        value={service.serviceTypeId}
                        onValueChange={(value) => handleServiceAllocationChange(service.tempId, 'serviceTypeId', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select Service" />
                        </SelectTrigger>
                        <SelectContent>
                          {isLoadingServiceTypes ? (
                            <SelectItem value="loading" disabled>Loading Services...</SelectItem>
                          ) : serviceTypesError ? (
                            <SelectItem value="error" disabled>Error loading services</SelectItem>
                          ) : (
                            availableServiceTypes?.map((st) => (
                              <SelectItem key={st.id} value={st.id}>
                                {st.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Quantity Input */}
                    <div className="w-20">
                      <label htmlFor={`quantity-${service.tempId}`} className="sr-only">Quantity</label>
                      <Input
                        id={`quantity-${service.tempId}`}
                        type="number"
                        min="1"
                        value={service.quantity}
                        onChange={(e) => handleServiceAllocationChange(service.tempId, 'quantity', parseInt(e.target.value) || 0)}
                        placeholder="Qty"
                        className="text-center"
                      />
                    </div>

                    {/* Period Type Select */}
                    <div className="w-32">
                      <label htmlFor={`period-type-${service.tempId}`} className="sr-only">Period</label>
                      <Select
                        value={service.periodType}
                        onValueChange={(value: 'weekly' | 'monthly') => handleServiceAllocationChange(service.tempId, 'periodType', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Period" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cost Per Session Input */}
                    <div className="w-28">
                      <label htmlFor={`cost-per-session-${service.tempId}`} className="sr-only">Cost</label>
                      <Input
                        id={`cost-per-session-${service.tempId}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={service.costPerSession}
                        onChange={(e) => handleServiceAllocationChange(service.tempId, 'costPerSession', parseFloat(e.target.value) || 0)}
                        placeholder="Cost"
                        className="text-center"
                      />
                    </div>
                  </div>
                ))}

                <Button
                  variant="secondary"
                  className="w-full mt-4"
                  onClick={handleAddService}
                  type="button"
                >
                  Add Service
                </Button>
              </div>
            </div>

            {/* Monthly Total Display */}
            <div className="grid grid-cols-4 items-center gap-4 mt-6 pt-4 border-t">
              <label className="text-right text-lg font-bold">Monthly Total</label>
              <div className="col-span-3 text-right text-2xl font-extrabold text-blue-600">
                {formattedMonthlyTotal}
              </div>
            </div>

            {/* Display form errors */}
            {form.formState.errors.servicesIncluded && (
              <p className="text-red-500 text-sm mt-2">{form.formState.errors.servicesIncluded.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
            <Button type="submit" disabled={createSubscriptionMutation.isPending}>
              {createSubscriptionMutation.isPending ? "Creating..." : "Create Subscription"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ClientSubscriptionModal;