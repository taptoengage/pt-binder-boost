import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

const ClientSubscriptionModal: React.FC<ClientSubscriptionModalProps> = ({ isOpen, onClose, clientId }) => {
  // Form states for initial inputs
  const [startDate, setStartDate] = useState<Date | undefined>(new Date()); // Default to today
  const [billingCycle, setBillingCycle] = useState<string>('monthly'); // Default
  const [paymentFrequency, setPaymentFrequency] = useState<string>('monthly'); // Default

  // Service allocations state
  const [servicesIncluded, setServicesIncluded] = useState<ServiceAllocation[]>([]);

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
    setServicesIncluded((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(), // Unique ID for key prop
        serviceTypeId: '', // Default empty
        quantity: 1, // Default quantity
        periodType: 'weekly', // Default period
        costPerSession: 0, // Default cost
      },
    ]);
    console.log("DEBUG: Added new service line.");
  };

  const handleRemoveService = (tempId: string) => {
    setServicesIncluded((prev) => prev.filter((service) => service.tempId !== tempId));
    console.log("DEBUG: Removed service line with tempId:", tempId);
  };

  const handleServiceAllocationChange = (tempId: string, field: keyof Omit<ServiceAllocation, 'tempId' | 'serviceTypeName'>, value: any) => {
    setServicesIncluded((prev) =>
      prev.map((service) =>
        service.tempId === tempId ? { ...service, [field]: value } : service
      )
    );
    console.log(`DEBUG: Updated service ${tempId} - Field: ${field}, Value: ${value}`);
  };

  // Calculate monthly total
  const monthlyTotal = servicesIncluded.reduce((sum, service) => {
    let serviceMonthlyCost = 0;
    if (service.quantity && service.costPerSession) {
      if (service.periodType === 'weekly') {
        serviceMonthlyCost = service.quantity * service.costPerSession * 4; // Assume 4 weeks per month
      } else if (service.periodType === 'monthly') {
        serviceMonthlyCost = service.quantity * service.costPerSession;
      }
    }
    return sum + serviceMonthlyCost;
  }, 0);

  // Format for display
  const formattedMonthlyTotal = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(monthlyTotal);

  const handleSubmit = async () => {
    console.log("DEBUG: Attempting to create subscription with payload:", {
      clientId,
      startDate: startDate ? format(startDate, 'yyyy-MM-dd') : null, // Format date for DB
      billingCycle,
      paymentFrequency,
      billingAmount: monthlyTotal, // Pass the calculated total
      servicesIncluded: servicesIncluded.map(s => ({
        service_type_id: s.serviceTypeId,
        quantity_per_period: s.quantity,
        period_type: s.periodType,
        cost_per_session: s.costPerSession,
      })),
    });

    // ... rest of the submission logic will go here in Prompt 3
    onClose(); // Still close for now
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
                  onSelect={setStartDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Billing Cycle */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="billing-cycle" className="text-right">Billing Cycle</label>
            <Select value={billingCycle} onValueChange={setBillingCycle}>
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
            <Select value={paymentFrequency} onValueChange={setPaymentFrequency}>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Create Subscription</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClientSubscriptionModal;