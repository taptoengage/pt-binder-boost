import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, setHours, setMinutes, isBefore, addMinutes } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Define interfaces for data fetched from Supabase
interface SessionPack {
  id: string;
  sessions_remaining: number;
  service_types: { name: string } | null;
  service_type_id: string;
}

interface ClientSubscription {
  id: string;
  billing_cycle: string;
  payment_frequency: string;
  billing_amount: number;
  status: string;
  // In future prompts, we'll fetch linked service_types
}

interface ServiceType {
  id: string;
  name: string;
}

interface SessionBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSlot: { start: Date; end: Date } | null;
  clientId: string;
  trainerId: string;
}

export default function SessionBookingModal({ isOpen, onClose, selectedSlot, clientId, trainerId }: SessionBookingModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isBooking, setIsBooking] = useState(false);
  // New state to manage the selected booking option as a single string
  const [selectedBookingOption, setSelectedBookingOption] = useState<string | null>(null);
  const [activeSessionPacks, setActiveSessionPacks] = useState<SessionPack[]>([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState<ClientSubscription[]>([]);
  const [availableServices, setAvailableServices] = useState<ServiceType[]>([]);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<string | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);

  // Helper to generate 30-minute time slots within an availability block
  const generateBookableTimeSlots = useCallback((start: Date, end: Date) => {
    const slots = [];
    let currentTime = start;
    while (isBefore(currentTime, end)) {
      slots.push(currentTime);
      currentTime = addMinutes(currentTime, 30); // Generate 30-minute increments
    }
    return slots;
  }, []);

  const bookableTimeSlots = useMemo(() => {
    if (!selectedSlot) return [];
    return generateBookableTimeSlots(selectedSlot.start, selectedSlot.end);
  }, [selectedSlot, generateBookableTimeSlots]);

  const canUseSubscription = useMemo(() => activeSubscriptions.length > 0, [activeSubscriptions]);
  const canUsePack = useMemo(() => activeSessionPacks.length > 0, [activeSessionPacks]);

  useEffect(() => {
    if (!isOpen || !clientId || !trainerId) return;

    const fetchClientEligibilityData = async () => {
      setIsLoading(true);
      try {
        // Fetch active session packs for the client
        const { data: packs, error: packsError } = await supabase
          .from('session_packs')
          .select('id, sessions_remaining, status, service_type_id, service_types(name)')
          .eq('client_id', clientId)
          .eq('trainer_id', trainerId)
          .eq('status', 'active')
          .gt('sessions_remaining', 0); // Only show packs with remaining sessions

        if (packsError) throw packsError;
        setActiveSessionPacks(packs || []);
        console.log("DEBUG: Fetched active session packs:", packs);

        // Fetch active subscriptions for the client
        const { data: subscriptions, error: subscriptionsError } = await supabase
          .from('client_subscriptions')
          .select('id, billing_cycle, payment_frequency, billing_amount, status')
          .eq('client_id', clientId)
          .eq('trainer_id', trainerId)
          .eq('status', 'active'); // Only show active subscriptions

        if (subscriptionsError) throw subscriptionsError;
        setActiveSubscriptions(subscriptions || []);
        console.log("DEBUG: Fetched active subscriptions:", subscriptions);

        // Fetch all service types created by this trainer
        const { data: services, error: servicesError } = await supabase
          .from('service_types')
          .select('id, name')
          .eq('trainer_id', trainerId);

        if (servicesError) throw servicesError;
        setAvailableServices(services || []);
        console.log("DEBUG: Fetched service types:", services);

      } catch (error: any) {
        console.error('Error fetching client eligibility data:', error.message);
        toast({
          title: "Error",
          description: "Failed to load booking eligibility data.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchClientEligibilityData();
  }, [isOpen, clientId, trainerId, toast]);

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !selectedStartTime || !selectedServiceTypeId || !selectedBookingOption) {
      toast({
        title: "Error",
        description: "Please select all required options.",
        variant: "destructive",
      });
      return;
    }

    setIsBooking(true);
    try {
      // Parse the single selectedBookingOption string
      const [method, id] = selectedBookingOption.split(':');

      // Get the final session date with the selected start time
      const [hour, minute] = selectedStartTime.split(':').map(Number);
      const sessionDateWithTime = setMinutes(setHours(selectedSlot.start, hour), minute);

      const bookingData = {
        clientId,
        trainerId,
        sessionDate: sessionDateWithTime.toISOString(),
        serviceTypeId: selectedServiceTypeId,
        bookingMethod: method,
        sourcePackId: method === 'pack' ? id : null,
        sourceSubscriptionId: method === 'subscription' ? id : null,
      };

      console.log('Submitting booking:', bookingData);

      const { data, error } = await supabase.functions.invoke('book-client-session', {
        body: bookingData,
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Success",
          description: data.message || "Session booked successfully!",
        });
        onClose();
      } else {
        throw new Error(data.error || 'Booking failed');
      }
    } catch (error: any) {
      console.error('Booking error:', error);
      toast({
        title: "Booking Failed",
        description: error.message || "Failed to book session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsBooking(false);
    }
  };

  const isConfirmDisabled = isLoading || isBooking || !selectedSlot || !selectedStartTime || !selectedServiceTypeId || !selectedBookingOption;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Book Session</DialogTitle>
          <DialogDescription>
            Confirm your session details and select a booking method.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            {selectedSlot && (
              <p className="text-sm font-medium">
                Session Date: {format(selectedSlot.start, 'MMM dd, yyyy')}
              </p>
            )}

            {/* NEW: Time Slot Selection using a dropdown */}
            <div className="space-y-2">
              <Label htmlFor="startTime">Choose a Start Time</Label>
              <Select
                value={selectedStartTime || ''}
                onValueChange={setSelectedStartTime}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a start time" />
                </SelectTrigger>
                <SelectContent>
                  {bookableTimeSlots.map((time, index) => (
                    <SelectItem key={index} value={format(time, 'HH:mm')}>
                      {format(time, 'h:mm a')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Service Type</Label>
              <RadioGroup
                value={selectedServiceTypeId || ''}
                onValueChange={setSelectedServiceTypeId}
                className="flex flex-col space-y-1"
              >
                {availableServices.length > 0 ? (
                  availableServices.map(service => (
                    <div key={service.id} className="flex items-center space-x-2">
                      <RadioGroupItem value={service.id} id={`service-${service.id}`} />
                      <Label htmlFor={`service-${service.id}`}>{service.name}</Label>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">No service types available for your trainer.</p>
                )}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>How would you like to book?</Label>
              {/* Single RadioGroup for all options */}
              <RadioGroup
                value={selectedBookingOption || ''}
                onValueChange={setSelectedBookingOption}
                className="flex flex-col space-y-2"
              >
                {activeSessionPacks.length > 0 && (
                  <Label className="font-semibold">From a Session Pack</Label>
                )}
                {activeSessionPacks.map(pack => (
                  <div key={pack.id} className="flex items-center space-x-2 ml-4">
                    <RadioGroupItem value={`pack:${pack.id}`} id={`pack-${pack.id}`} />
                    <Label htmlFor={`pack-${pack.id}`}>
                      Use Pack: {pack.service_types?.name} ({pack.sessions_remaining} remaining)
                    </Label>
                  </div>
                ))}

                {activeSubscriptions.length > 0 && (
                  <Label className="font-semibold">From an Active Subscription</Label>
                )}
                {activeSubscriptions.map(sub => (
                  <div key={sub.id} className="flex items-center space-x-2 ml-4">
                    <RadioGroupItem value={`subscription:${sub.id}`} id={`subscription-${sub.id}`} />
                    <Label htmlFor={`subscription-${sub.id}`}>
                      Use Subscription: {sub.billing_cycle} ({sub.payment_frequency})
                    </Label>
                  </div>
                ))}

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="one-off" id="one-off" />
                  <Label htmlFor="one-off">Request One-Off Session (Trainer Approval Needed)</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading || isBooking}>Cancel</Button>
          <Button type="submit" onClick={handleConfirmBooking} disabled={isConfirmDisabled}>
            {isBooking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isBooking ? 'Booking...' : 'Confirm Booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}