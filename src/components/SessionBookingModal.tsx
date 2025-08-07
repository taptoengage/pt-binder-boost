import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

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
  const [bookingMethod, setBookingMethod] = useState<'pack' | 'subscription' | 'one-off' | ''>('');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null);
  const [activeSessionPacks, setActiveSessionPacks] = useState<SessionPack[]>([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState<ClientSubscription[]>([]);
  const [availableServices, setAvailableServices] = useState<ServiceType[]>([]);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<string | null>(null);

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

  // This function will call the Edge Function in a future prompt
  const handleConfirmBooking = async () => {
    console.log("DEBUG: Placeholder for booking confirmation logic.");
    onClose(); // Just close the modal for now
  };

  const isConfirmDisabled = isLoading || !selectedSlot || !bookingMethod || !selectedServiceTypeId;

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
                Session Time: {format(selectedSlot.start, 'MMM dd, yyyy h:mm a')} - {format(selectedSlot.end, 'h:mm a')}
              </p>
            )}

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
              <RadioGroup
                value={bookingMethod}
                onValueChange={(value) => {
                  setBookingMethod(value as any);
                  setSelectedPackId(null); // Clear selections on method change
                  setSelectedSubscriptionId(null);
                }}
                className="flex flex-col space-y-1"
              >
                {canUsePack && (
                  <div className="flex flex-col space-y-2">
                    <Label className="font-semibold">From a Session Pack</Label>
                    <RadioGroup onValueChange={setSelectedPackId} value={selectedPackId || ''} className="space-y-1 ml-4">
                      {activeSessionPacks.map(pack => (
                        <div key={pack.id} className="flex items-center space-x-2">
                          <RadioGroupItem value={`pack-${pack.id}`} id={`pack-${pack.id}`} disabled={bookingMethod !== 'pack'} />
                          <Label htmlFor={`pack-${pack.id}`}>
                            Use Pack: {pack.service_types?.name} ({pack.sessions_remaining} remaining)
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}

                {canUseSubscription && (
                  <div className="flex flex-col space-y-2">
                    <Label className="font-semibold">From an Active Subscription</Label>
                    <RadioGroup onValueChange={setSelectedSubscriptionId} value={selectedSubscriptionId || ''} className="space-y-1 ml-4">
                      {activeSubscriptions.map(sub => (
                        <div key={sub.id} className="flex items-center space-x-2">
                          <RadioGroupItem value={`subscription-${sub.id}`} id={`subscription-${sub.id}`} disabled={bookingMethod !== 'subscription'} />
                          <Label htmlFor={`subscription-${sub.id}`}>
                            Use Subscription: {sub.billing_cycle} ({sub.payment_frequency})
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="one-off" id="one-off" />
                  <Label htmlFor="one-off">Request One-Off Session (Trainer Approval Needed)</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button type="submit" onClick={handleConfirmBooking} disabled={isConfirmDisabled}>
            Confirm Booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}