import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useRecurringScheduleGeneration } from '@/hooks/useRecurringScheduleGeneration';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function RecurringSessionsTest() {
  const { user } = useAuth();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { toast } = useToast();
  const { generateSchedule } = useRecurringScheduleGeneration();

  const [clients, setClients] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [preferences, setPreferences] = useState<any[]>([]);
  const [packs, setPacks] = useState<any[]>([]);

  const [selectedClient, setSelectedClient] = useState('');
  const [selectedServiceType, setSelectedServiceType] = useState('');
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bookingMethod, setBookingMethod] = useState<'one-off' | 'pack' | 'subscription'>('one-off');
  const [selectedPack, setSelectedPack] = useState('');

  const [proposedSessions, setProposedSessions] = useState<any[]>([]);
  const [excludedSessions, setExcludedSessions] = useState<Array<{ date: string; time: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [scheduleId, setScheduleId] = useState<string | null>(null);

  const featureEnabled = import.meta.env.VITE_RECURRING_SESSIONS_V1 === 'true';

  useEffect(() => {
    if (user?.id && isAdmin) {
      loadData();
    }
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (selectedClient) {
      loadClientPreferences(selectedClient);
      if (bookingMethod === 'pack') {
        loadClientPacks(selectedClient);
      }
    }
  }, [selectedClient, bookingMethod]);

  const loadData = async () => {
    const [clientsRes, serviceTypesRes] = await Promise.all([
      supabase.from('clients').select('*').eq('trainer_id', user!.id),
      supabase.from('service_types').select('*').eq('trainer_id', user!.id)
    ]);

    if (clientsRes.data) setClients(clientsRes.data);
    if (serviceTypesRes.data) setServiceTypes(serviceTypesRes.data);
  };

  const loadClientPreferences = async (clientId: string) => {
    const { data } = await supabase
      .from('client_time_preferences')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true);
    
    if (data) setPreferences(data);
  };

  const loadClientPacks = async (clientId: string) => {
    const { data } = await supabase
      .from('session_packs')
      .select('*, service_types(name)')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .gt('sessions_remaining', 0);
    
    if (data) setPacks(data);
  };

  const handlePreview = async () => {
    if (!validateForm()) return;

    setLoading(true);
    const { data, error } = await generateSchedule({
      action: 'preview',
      trainerId: user!.id,
      clientId: selectedClient,
      preferenceIds: selectedPreferences,
      startDate,
      endDate,
      bookingMethod,
      sessionPackId: bookingMethod === 'pack' ? selectedPack : undefined,
      serviceTypeId: selectedServiceType,
    });

    setLoading(false);

    if (error) {
      toast({
        title: 'Preview Failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setProposedSessions(data?.proposedSessions || []);
    setExcludedSessions([]);
    setScheduleId(null);
  };

  const handleConfirm = async () => {
    if (!validateForm()) return;

    setLoading(true);
    const { data, error } = await generateSchedule({
      action: 'confirm',
      trainerId: user!.id,
      clientId: selectedClient,
      preferenceIds: selectedPreferences,
      startDate,
      endDate,
      bookingMethod,
      sessionPackId: bookingMethod === 'pack' ? selectedPack : undefined,
      serviceTypeId: selectedServiceType,
      excludedSessions,
    });

    setLoading(false);

    if (error) {
      toast({
        title: 'Confirmation Failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setScheduleId(data?.scheduleId);
    toast({
      title: 'Schedule Created',
      description: `Schedule ID: ${data?.scheduleId}`,
    });
  };

  const validateForm = () => {
    if (!selectedClient || !selectedServiceType || !startDate || !endDate || selectedPreferences.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill all required fields',
        variant: 'destructive',
      });
      return false;
    }

    if (bookingMethod === 'pack' && !selectedPack) {
      toast({
        title: 'Validation Error',
        description: 'Please select a session pack',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const toggleExcluded = (date: string, time: string) => {
    const exists = excludedSessions.some(e => e.date === date && e.time === time);
    if (exists) {
      setExcludedSessions(excludedSessions.filter(e => !(e.date === date && e.time === time)));
    } else {
      setExcludedSessions([...excludedSessions, { date, time }]);
    }
  };

  const isExcluded = (date: string, time: string) => {
    return excludedSessions.some(e => e.date === date && e.time === time);
  };

  const hasUnresolvedConflicts = proposedSessions.some(
    s => s.status === 'conflict' && !isExcluded(s.date, s.time)
  );

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin || !featureEnabled) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Access denied or feature not enabled</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recurring Sessions Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Service Type</Label>
              <Select value={selectedServiceType} onValueChange={setSelectedServiceType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map(st => (
                    <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Booking Method</Label>
              <Select value={bookingMethod} onValueChange={(v: any) => setBookingMethod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-off">One-off</SelectItem>
                  <SelectItem value="pack">Pack</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {bookingMethod === 'pack' && (
              <div className="space-y-2">
                <Label>Session Pack</Label>
                <Select value={selectedPack} onValueChange={setSelectedPack}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select pack" />
                  </SelectTrigger>
                  <SelectContent>
                    {packs.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.service_types?.name} - {p.sessions_remaining} remaining
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Active Time Preferences</Label>
            <div className="space-y-2 border rounded p-3">
              {preferences.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active preferences for this client</p>
              ) : (
                preferences.map(p => (
                  <div key={p.id} className="flex items-center space-x-2">
                    <Checkbox
                      checked={selectedPreferences.includes(p.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedPreferences([...selectedPreferences, p.id]);
                        } else {
                          setSelectedPreferences(selectedPreferences.filter(id => id !== p.id));
                        }
                      }}
                    />
                    <label className="text-sm">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][p.weekday]} {p.start_time}
                      {p.flex_minutes > 0 && ` (±${p.flex_minutes}min)`}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handlePreview} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Preview
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={loading || proposedSessions.length === 0 || hasUnresolvedConflicts}
              variant="default"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm
            </Button>
          </div>

          {scheduleId && (
            <div className="p-4 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                Schedule created: {scheduleId}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {proposedSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Proposed Sessions ({proposedSessions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {proposedSessions.map((session, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 border rounded"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={isExcluded(session.date, session.time)}
                      onCheckedChange={() => toggleExcluded(session.date, session.time)}
                      disabled={session.status !== 'conflict'}
                    />
                    <span className="text-sm font-medium">{session.date}</span>
                    <span className="text-sm">{session.time}</span>
                  </div>
                  <Badge
                    variant={
                      session.status === 'ok' ? 'default' :
                      session.status === 'warning' ? 'secondary' : 'destructive'
                    }
                  >
                    {session.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
