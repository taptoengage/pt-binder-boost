import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarDays, Clock, X, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { generateTimeOptions } from '@/lib/availabilityUtils';

const timeOptions = generateTimeOptions();

// Enhanced form validation schema for bulk configuration
const BulkBlockConfigurationSchema = z.object({
  blockType: z.enum(['full_day', 'partial_day']),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reason: z.string().min(1, 'Please provide a reason for blocking this period'),
  applyToAllDates: z.boolean().default(true),
}).refine((data) => {
  if (data.blockType === 'partial_day') {
    return data.startTime && data.endTime && data.startTime < data.endTime;
  }
  return true;
}, {
  message: "Start time must be before end time for partial day blocks",
  path: ["endTime"],
});

type BulkBlockConfigurationFormData = z.infer<typeof BulkBlockConfigurationSchema>;

interface BlockAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainerId: string;
}

export default function BlockAvailabilityModal({
  isOpen,
  onClose,
  trainerId,
}: BlockAvailabilityModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Step management
  const [currentStep, setCurrentStep] = useState<'select_dates' | 'bulk_configure'>('select_dates');
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Enhanced form for bulk configuration
  const form = useForm<BulkBlockConfigurationFormData>({
    resolver: zodResolver(BulkBlockConfigurationSchema),
    defaultValues: {
      blockType: 'full_day',
      reason: '',
      applyToAllDates: true,
    },
  });

  // Reset modal state when closing
  const handleClose = () => {
    setCurrentStep('select_dates');
    setSelectedDates([]);
    form.reset();
    onClose();
  };

  // Move to bulk configuration step
  const handleProceedToBulkConfiguration = () => {
    if (selectedDates.length === 0) {
      toast({
        title: "No dates selected",
        description: "Please select at least one date to block.",
        variant: "destructive",
      });
      return;
    }
    setCurrentStep('bulk_configure');
  };

  // Submit all blocks with the same configuration
  const handleSubmitBulkBlocks = async (formData: BulkBlockConfigurationFormData) => {
    if (selectedDates.length === 0) {
      toast({
        title: "No dates selected",
        description: "Please select dates to block.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare batch insert data with the same configuration for all dates
      const exceptionsToInsert = selectedDates.map(date => ({
        trainer_id: trainerId,
        exception_date: format(date, 'yyyy-MM-dd'),
        exception_type: formData.blockType === 'full_day' ? 'unavailable_full_day' : 'unavailable_partial_day',
        start_time: formData.blockType === 'partial_day' ? formData.startTime : null,
        end_time: formData.blockType === 'partial_day' ? formData.endTime : null,
        is_available: false,
        notes: formData.reason,
      }));

      console.log('Submitting bulk availability blocks:', {
        count: exceptionsToInsert.length,
        dates: selectedDates.map(d => format(d, 'yyyy-MM-dd')),
        config: formData
      });

      // Batch insert all exceptions
      const { error } = await supabase
        .from('trainer_availability_exceptions')
        .insert(exceptionsToInsert);

      if (error) {
        if (error.code === '23505') {
          // Handle duplicate key constraint
          toast({
            title: "Duplicate dates detected",
            description: "Some of the selected dates already have availability exceptions. Please check your calendar and try again.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      // Success feedback
      const dateRangeText = selectedDates.length === 1 
        ? format(selectedDates[0], 'MMM d, yyyy')
        : selectedDates.length <= 3
        ? selectedDates.map(d => format(d, 'MMM d')).join(', ')
        : `${selectedDates.length} dates`;

      toast({
        title: "Availability blocked successfully",
        description: `Successfully blocked ${dateRangeText} - ${formData.reason}`,
      });

      // Invalidate relevant queries to refresh calendar
      queryClient.invalidateQueries({ queryKey: ['trainerAvailabilityExceptions'] });

      // Close modal
      handleClose();

    } catch (error) {
      console.error('Error blocking availability:', error);
      toast({
        title: "Error blocking availability",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Block Availability
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Date Selection */}
        {currentStep === 'select_dates' && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Select Dates to Block</h3>
              <p className="text-muted-foreground">
                Choose one or more dates when you'll be unavailable for sessions. You can configure all selected dates with the same settings in the next step.
              </p>
            </div>

            <div className="flex justify-center">
              <Calendar
                mode="multiple"
                selected={selectedDates}
                onSelect={(dates) => setSelectedDates(dates || [])}
                className="rounded-md border"
                disabled={(date) => date < new Date()}
              />
            </div>

            {selectedDates.length > 0 && (
              <div className="space-y-2">
                <Label>Selected Dates ({selectedDates.length})</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {selectedDates.map((date) => (
                    <Badge key={format(date, 'yyyy-MM-dd')} variant="secondary" className="flex items-center gap-1">
                      {format(date, 'MMM d, yyyy')}
                      <button
                        onClick={() => setSelectedDates(prev => 
                          prev.filter(d => format(d, 'yyyy-MM-dd') !== format(date, 'yyyy-MM-dd'))
                        )}
                        className="ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {selectedDates.length > 10 && (
                  <p className="text-xs text-muted-foreground">
                    Tip: You can configure all {selectedDates.length} dates with the same settings in the next step.
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleProceedToBulkConfiguration} disabled={selectedDates.length === 0}>
                Continue to Configuration
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Bulk Configuration */}
        {currentStep === 'bulk_configure' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Configure Block Settings</h3>
                <p className="text-muted-foreground">
                  These settings will be applied to all {selectedDates.length} selected date{selectedDates.length > 1 ? 's' : ''}.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setCurrentStep('select_dates')}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Date Selection
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Configuration Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Block Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={form.handleSubmit(handleSubmitBulkBlocks)}
                    className="space-y-4"
                  >
                    <div className="space-y-3">
                      <Label htmlFor="blockType">Block Type</Label>
                      <Controller
                        name="blockType"
                        control={form.control}
                        render={({ field }) => (
                          <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className="flex flex-col space-y-2"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="full_day" id="full_day" />
                              <Label htmlFor="full_day">Full Day - Unavailable all day</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="partial_day" id="partial_day" />
                              <Label htmlFor="partial_day">Partial Day - Unavailable during specific hours</Label>
                            </div>
                          </RadioGroup>
                        )}
                      />
                    </div>

                    {form.watch('blockType') === 'partial_day' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="startTime">Start Time</Label>
                          <Controller
                            name="startTime"
                            control={form.control}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select start time" />
                                </SelectTrigger>
                                <SelectContent>
                                  {timeOptions.map((time) => (
                                    <SelectItem key={time} value={time}>
                                      {time}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endTime">End Time</Label>
                          <Controller
                            name="endTime"
                            control={form.control}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select end time" />
                                </SelectTrigger>
                                <SelectContent>
                                  {timeOptions.map((time) => (
                                    <SelectItem key={time} value={time}>
                                      {time}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="reason">Reason for Blocking</Label>
                      <Controller
                        name="reason"
                        control={form.control}
                        render={({ field }) => (
                          <Textarea
                            {...field}
                            placeholder="e.g., Vacation, Conference, Personal appointment..."
                            rows={3}
                          />
                        )}
                      />
                      {form.formState.errors.reason && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.reason.message}
                        </p>
                      )}
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">Bulk Configuration</span>
                      </div>
                      <p className="text-xs text-blue-700">
                        These settings will be applied to all {selectedDates.length} selected dates simultaneously.
                      </p>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isSubmitting || !form.formState.isValid}
                    >
                      {isSubmitting ? 'Blocking...' : `Block ${selectedDates.length} Date${selectedDates.length > 1 ? 's' : ''}`}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Summary Panel */}
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm">
                      <span>Total dates selected:</span>
                      <span className="font-medium">{selectedDates.length}</span>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Selected Dates</Label>
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {selectedDates.map((date) => (
                          <div
                            key={format(date, 'yyyy-MM-dd')}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-sm text-sm"
                          >
                            <span>{format(date, 'EEEE, MMM d, yyyy')}</span>
                            <Badge variant="outline" className="text-xs">
                              Pending
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedDates.length > 5 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs text-green-700">
                          💡 <strong>Time Saver:</strong> You're configuring {selectedDates.length} dates at once instead of individually - much more efficient!
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}