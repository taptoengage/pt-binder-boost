import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Clock, Plus, Trash2, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { 
  getCurrentClientId, 
  fetchClientTimePreferences, 
  createTimePreference, 
  updateTimePreference, 
  deleteTimePreference,
  validateTimePreference
} from '@/lib/client-preferences';
import { 
  ClientTimePreference, 
  CreateTimePreferenceInput, 
  WEEKDAY_NAMES, 
  WEEKDAY_ABBREVIATIONS,
  FLEX_MINUTES_OPTIONS,
  Weekday
} from '@/types/scheduling';

// Form schema for a single time preference
const TimePreferenceSchema = z.object({
  weekday: z.number().min(0).max(6),
  start_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  end_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)').optional(),
  flex_minutes: z.number().min(0).max(180),
  notes: z.string().optional(),
  is_active: z.boolean(),
});

const PreferencesFormSchema = z.object({
  preferences: z.array(TimePreferenceSchema),
});

type PreferencesFormData = z.infer<typeof PreferencesFormSchema>;

// Overlap detection helpers
const toRange = (s: string, e?: string) => {
  const start = s;
  const end = e && e.length ? e : s; // point-in-time if no end_time
  return { start, end };
};

const overlaps = (a: {start: string, end: string}, b: {start: string, end: string}) =>
  !(a.end <= b.start || b.end <= a.start);

export default function PreferredTimesCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Get current client ID
  const { data: clientId } = useQuery({
    queryKey: ['currentClientId'],
    queryFn: getCurrentClientId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch client preferences
  const { data: preferences = [], isLoading } = useQuery({
    queryKey: ['clientTimePreferences', clientId],
    queryFn: () => fetchClientTimePreferences(clientId!),
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Initialize form
  const form = useForm<PreferencesFormData>({
    resolver: zodResolver(PreferencesFormSchema),
    defaultValues: {
      preferences: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'preferences',
  });

  // Reset form when preferences change or editing starts
  React.useEffect(() => {
    if (isEditing) {
      const formData = preferences.map(pref => ({
        weekday: pref.weekday,
        start_time: pref.start_time.slice(0, 5), // Remove seconds if present
        end_time: pref.end_time?.slice(0, 5) || undefined,
        flex_minutes: pref.flex_minutes,
        notes: pref.notes || undefined,
        is_active: pref.is_active,
      }));
      form.reset({ preferences: formData });
    }
  }, [isEditing, preferences, form]);

  const handleAddPreference = useCallback(() => {
    append({
      weekday: 1, // Default to Monday
      start_time: '09:00',
      end_time: undefined,
      flex_minutes: 15,
      notes: undefined,
      is_active: true,
    });
  }, [append]);

  const handleSave = useCallback(async (data: PreferencesFormData) => {
    if (!clientId) return;

    setIsSaving(true);
    try {
      // Validate all preferences
      const validationErrors: string[] = [];
      data.preferences.forEach((pref, index) => {
        const validation = validateTimePreference({
          ...pref,
          start_time: pref.start_time + ':00', // Add seconds for validation
          end_time: pref.end_time ? pref.end_time + ':00' : undefined,
        });
        if (!validation.isValid) {
          validationErrors.push(`Preference ${index + 1}: ${validation.errors.join(', ')}`);
        }
      });

      if (validationErrors.length > 0) {
        toast({
          title: "Validation Error",
          description: validationErrors.join('\n'),
          variant: "destructive",
        });
        return;
      }

      // Check for duplicate weekday + start_time combinations
      const duplicates = new Set();
      const hasDuplicates = data.preferences.some(pref => {
        const key = `${pref.weekday}-${pref.start_time}`;
        if (duplicates.has(key)) return true;
        duplicates.add(key);
        return false;
      });

      if (hasDuplicates) {
        toast({
          title: "Validation Error", 
          description: "You cannot have duplicate time slots for the same day.",
          variant: "destructive",
        });
        return;
      }

      // Check for overlapping time windows on the same weekday
      const byDay = new Map<number, Array<{start: string, end: string}>>();
      for (const r of data.preferences) {
        const day = Number(r.weekday);
        const arr = byDay.get(day) ?? [];
        arr.push(toRange(r.start_time, r.end_time));
        byDay.set(day, arr);
      }
      
      for (const [, ranges] of byDay) {
        // sort by start for O(n log n) then linear check
        ranges.sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 1; i < ranges.length; i++) {
          if (overlaps(ranges[i-1], ranges[i])) {
            toast({
              title: "Validation Error",
              description: "Overlapping times on the same day are not allowed.",
              variant: "destructive",
            });
            return;
          }
        }
      }

      // 1) Read current DB state
      const { data: existingRows, error: exErr } = await supabase
        .from("client_time_preferences")
        .select("id,weekday,start_time,end_time,flex_minutes,notes,is_active")
        .eq("client_id", clientId);
      if (exErr) throw exErr;

      // 2) Build desired rows (convert to HH:mm:ss here)
      const desired = data.preferences.map(p => ({
        client_id: clientId,
        weekday: p.weekday,
        start_time: p.start_time + ":00",
        end_time: p.end_time ? p.end_time + ":00" : null,
        flex_minutes: p.flex_minutes,
        notes: p.notes ?? null,
        is_active: p.is_active,
      }));

      // 3) Upsert desired rows (Supabase will match on composite keys if defined, else insert new)
      //    We use 'upsert' to add/update by natural uniqueness (client_id+weekday+start_time) or rely on 'id' if present.
      const { data: upserted, error: upErr } = await supabase
        .from("client_time_preferences")
        .upsert(desired, { onConflict: "client_id,weekday,start_time" })
        .select("id,client_id,weekday,start_time");
      if (upErr) throw upErr;

      // 4) Compute rows to delete (those that existed, but aren't in desired AFTER normalization)
      //    Build a string key to avoid floating equality on times.
      const desiredKeys = new Set(
        desired.map(r => `${r.client_id}|${r.weekday}|${r.start_time}`)
      );
      const toDeleteIds =
        (existingRows ?? [])
          .filter(r => !desiredKeys.has(`${clientId}|${r.weekday}|${(r.start_time || "").slice(0,8)}`))
          .map(r => r.id);

      if (toDeleteIds.length) {
        const { error: delErr } = await supabase
          .from("client_time_preferences")
          .delete()
          .in("id", toDeleteIds);
        if (delErr) throw delErr;
      }

      // 5) Refresh
      queryClient.invalidateQueries({ queryKey: ['clientTimePreferences', clientId] });
      setIsEditing(false);
      toast({ title: "Preferences Saved", description: "Your preferred time slots were updated." });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e?.message ?? "Save failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [clientId, queryClient, toast]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    form.reset();
  }, [form]);

  if (isLoading || !clientId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Preferred Time Slots
          </CardTitle>
          <CardDescription>
            Loading your preferences...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Clock className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Preferred Time Slots
          </CardTitle>
          <CardDescription>
            Set your preferred training times. Your trainer can see these preferences and use them when booking sessions.
          </CardDescription>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            {preferences.length > 0 ? 'Edit' : 'Add'} Preferences
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!isEditing ? (
          // Display mode
          <div className="space-y-4">
            {preferences.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No preferences set</p>
                <p className="text-sm">Add your preferred training times to help your trainer schedule sessions.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {preferences.map((pref) => (
                  <div
                    key={pref.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-medium">
                        {WEEKDAY_ABBREVIATIONS[pref.weekday as Weekday]}
                      </Badge>
                      <div className="text-sm">
                        <div className="font-medium">
                          {pref.start_time.slice(0, 5)}
                          {pref.end_time && ` - ${pref.end_time.slice(0, 5)}`}
                        </div>
                        {pref.flex_minutes > 0 && (
                          <div className="text-muted-foreground">
                            ±{pref.flex_minutes} mins flexibility
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {pref.notes && (
                        <div className="text-xs text-muted-foreground mb-1">
                          {pref.notes}
                        </div>
                      )}
                      <Badge variant={pref.is_active ? "default" : "secondary"}>
                        {pref.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // Edit mode
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Preference #{index + 1}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`preferences.${index}.weekday`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Day of Week</FormLabel>
                            <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select day" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Object.entries(WEEKDAY_NAMES).map(([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`preferences.${index}.start_time`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Time</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`preferences.${index}.end_time`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Time (Optional)</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`preferences.${index}.flex_minutes`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Flexibility</FormLabel>
                            <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select flexibility" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {FLEX_MINUTES_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value.toString()}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`preferences.${index}.notes`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Any specific notes about this time slot..."
                              {...field}
                              rows={2}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`preferences.${index}.is_active`}
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="cursor-pointer">
                            Active preference
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleAddPreference}
                className="flex items-center gap-2 w-full"
              >
                <Plus className="h-4 w-4" />
                Add Another Preference
              </Button>

              <div className="flex gap-2 pt-4">
                <Button 
                  type="submit" 
                  className="flex items-center gap-2"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Clock className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Preferences
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  className="flex items-center gap-2"
                  disabled={isSaving}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}