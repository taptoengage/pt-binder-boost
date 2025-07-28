import React, { useState, useMemo } from 'react';
import { DashboardNavigation } from '@/components/Navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ArrowLeft, Loader2, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Generate time options (30-minute intervals)
const generateTimeOptions = () => {
  const times = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      times.push(timeString);
    }
  }
  return times;
};
const timeOptions = generateTimeOptions();

// Zod Schema for adding a recurring availability slot
const RecurringAvailabilitySchema = z.object({
  day_of_week: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], {
    message: "Day of week is required."
  }),
  start_time: z.string().min(1, 'Start time is required.'),
  end_time: z.string().min(1, 'End time is required.'),
}).superRefine((data, ctx) => {
  if (data.start_time >= data.end_time) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End time must be after start time.",
      path: ['end_time'],
    });
  }
});

type RecurringAvailabilityFormData = z.infer<typeof RecurringAvailabilitySchema>;

export default function ManageAvailability() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form for adding new recurring slots
  const form = useForm<RecurringAvailabilityFormData>({
    resolver: zodResolver(RecurringAvailabilitySchema),
    defaultValues: {
      day_of_week: 'monday',
      start_time: '09:00',
      end_time: '17:00',
    },
    mode: 'onChange',
  });

  // Fetch existing recurring availability templates
  const { data: recurringTemplates, isLoading, error } = useQuery({
    queryKey: ['trainerAvailabilityTemplates', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('trainer_availability_templates')
        .select('*')
        .eq('trainer_id', user.id)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) {
        console.error("Error fetching recurring templates:", error);
        throw error;
      }
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000, // Cache for 1 minute
  });

  // Custom sort order for days of the week
  const dayOrder: { [key: string]: number } = {
    'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 7
  };
  const sortedTemplates = useMemo(() => {
    if (!recurringTemplates) return [];
    return [...recurringTemplates].sort((a, b) => dayOrder[a.day_of_week] - dayOrder[b.day_of_week]);
  }, [recurringTemplates]);

  // Handle adding a new recurring slot
  const handleAddTemplateSubmit = async (data: RecurringAvailabilityFormData) => {
    if (!user?.id) {
      toast({ title: 'Error', description: 'Trainer ID not available.', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('trainer_availability_templates')
        .insert({
          trainer_id: user.id,
          day_of_week: data.day_of_week,
          start_time: data.start_time,
          end_time: data.end_time,
        });

      if (error) {
        // Check for unique constraint error (e.g., if adding duplicate)
        if (error.code === '23505') { // PostgreSQL unique violation error code
            toast({
                title: 'Error',
                description: 'An identical availability slot already exists for this day.',
                variant: 'destructive',
            });
        } else {
            throw error;
        }
      } else {
        toast({ title: 'Success', description: 'Availability slot added!', });
        form.reset(); // Reset form fields
        queryClient.invalidateQueries({ queryKey: ['trainerAvailabilityTemplates', user.id] }); // Refresh list
      }
    } catch (error: any) {
      console.error("Error adding availability:", error);
      toast({ title: 'Error', description: `Failed to add availability: ${error.message}`, variant: 'destructive', });
    }
  };

  // Handle deleting an existing recurring slot
  const handleDeleteTemplate = async (templateId: string) => {
    if (!user?.id) {
      toast({ title: 'Error', description: 'Trainer ID not available.', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('trainer_availability_templates')
        .delete()
        .eq('id', templateId)
        .eq('trainer_id', user.id); // Ensure only deleting own templates

      if (error) throw error;

      toast({ title: 'Success', description: 'Availability slot deleted!', });
      queryClient.invalidateQueries({ queryKey: ['trainerAvailabilityTemplates', user.id] }); // Refresh list
    } catch (error: any) {
      console.error("Error deleting availability:", error);
      toast({ title: 'Error', description: `Failed to delete availability: ${error.message}`, variant: 'destructive', });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return
          </Button>
          <h1 className="text-heading-1 mb-4">Manage My Availability</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recurring Availability Section */}
          <Card>
            <CardHeader>
              <CardTitle>Recurring Availability</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">Define your standard weekly working hours.</p>

              {/* Form to Add New Slot */}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleAddTemplateSubmit)} className="space-y-4 mb-6 p-4 border rounded-lg bg-muted/50">
                  <h3 className="text-lg font-semibold">Add New Slot</h3>
                  <FormField
                    control={form.control}
                    name="day_of_week"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Day of Week</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a day" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                              <SelectItem key={day} value={day}>
                                {day.charAt(0).toUpperCase() + day.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="start_time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Time</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select start time" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-48 overflow-y-auto">
                              {timeOptions.map(time => (
                                <SelectItem key={time} value={time}>{time}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="end_time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Time</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select end time" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-48 overflow-y-auto">
                              {timeOptions.map(time => (
                                <SelectItem key={time} value={time}>{time}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isValid} className="w-full">
                    {form.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Add Slot
                  </Button>
                </form>
              </Form>

              {/* List of Existing Slots */}
              <h3 className="text-lg font-semibold mb-2">My Current Slots</h3>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Loading availability...</span>
                </div>
              ) : sortedTemplates.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No recurring availability slots set up yet.</p>
              ) : (
                <div className="space-y-3">
                  {sortedTemplates.map(template => (
                    <Card key={template.id} className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-semibold">{template.day_of_week.charAt(0).toUpperCase() + template.day_of_week.slice(1)}</p>
                        <p className="text-sm text-muted-foreground">{template.start_time} - {template.end_time}</p>
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDeleteTemplate(template.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* One-Off Adjustments Section */}
          <Card>
            <CardHeader>
              <CardTitle>One-Off Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Add or remove availability for specific dates (e.g., holidays, appointments).</p>
              {/* Placeholder for date-specific adjustments */}
              <div className="mt-4 p-4 border rounded-lg bg-muted/50 text-center text-muted-foreground">
                Date-Specific Overrides (Coming Soon)
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}