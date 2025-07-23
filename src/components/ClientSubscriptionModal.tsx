import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';

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

  // This will be populated in the next prompt
  const [servicesIncluded, setServicesIncluded] = useState<any[]>([]); // Placeholder for services

  const handleSubmit = async () => {
    // This logic will be implemented in a future prompt (Prompt 3)
    console.log("DEBUG: Attempting to create subscription with:", {
      clientId,
      startDate,
      billingCycle,
      paymentFrequency,
      servicesIncluded, // Currently empty
    });
    // Close modal after (simulated) submission
    onClose();
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

          {/* Placeholder for Services Included - will be built in next prompt */}
          <div className="grid grid-cols-4 items-start gap-4 mt-4">
            <label className="text-right pt-2">Services Included</label>
            <div className="col-span-3 border p-4 rounded-md bg-gray-50 text-gray-500 italic">
              (Dynamic service allocation and cost inputs will go here in the next development phase.)
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