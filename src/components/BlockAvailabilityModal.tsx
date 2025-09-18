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
import { CalendarDays, Clock, X, ChevronLeft, ChevronRight, CheckCircle, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { generateTimeOptions } from '@/lib/availabilityUtils';

const timeOptions = generateTimeOptions();

// TRUE BULK CONFIGURATION SCHEMA - Single form for all dates
const BulkBlockConfigurationSchema = z.object({
  blockType: z.enum(['full_day', 'partial_day']),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reason: z.string().min(1, 'Please provide a reason for blocking this period'),
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
  
  // True 2-step flow: Select dates → Configure once for all
  const [currentStep, setCurrentStep] = useState<'select_dates' | 'configure_bulk'>('select_dates');
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Single form for ALL selected dates
  const form = useForm<BulkBlockConfigurationFormData>({
    resolver: zodResolver(BulkBlockConfigurationSchema),
    defaultValues: {
      blockType: 'full_day',
      reason: '',
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
    setCurrentStep('configure_bulk');
  };

  // SINGLE FORM SUBMISSION for ALL dates - True bulk configuration
  const handleBulkSubmit = async (formData: BulkBlockConfigurationFormData) => {
    if (selectedDates.length === 0) return;

    setIsSubmitting(true);

    try {
      // Create identical exception records for ALL selected dates
      const exceptionsToInsert = selectedDates.map(date => ({
        trainer_id: trainerId,
        exception_date: format(date, 'yyyy-MM-dd'),
        exception_type: formData.blockType === 'full_day' ? 'unavailable_full_day' : 'unavailable_partial_day',
        start_time: formData.blockType === 'partial_day' ? formData.startTime : null,
        end_time: formData.blockType === 'partial_day' ? formData.endTime : null,
        is_available: false,
        notes: formData.reason,
      }));

      console.log('Bulk blocking availability:', {
        dateCount: selectedDates.length,
        reason: formData.reason,
        blockType: formData.blockType,
        timeRange: formData.blockType === 'partial_day' ? `${formData.startTime}-${formData.endTime}` : 'Full day'
      });

      // Single batch insert for ALL dates
      const { error } = await supabase
        .from('trainer_availability_exceptions')
        .insert(exceptionsToInsert);

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Some dates already blocked",
            description: "Some selected dates already have availability exceptions. Please check your calendar and try again.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      // Enhanced success message based on date range
      const successMessage = selectedDates.length === 1 
        ? `Blocked ${format(selectedDates[0], 'MMM d, yyyy')}`
        : selectedDates.length <= 3
        ? `Blocked ${selectedDates.map(d => format(d, 'MMM d')).join(', ')}`
        : `Blocked ${selectedDates.length} dates`;

      toast({
        title: "Availability blocked successfully!",
        description: `${successMessage} - ${formData.reason}`,
      });

      // Refresh calendar data
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

  // Calculate efficiency gains for UX feedback
  const efficiencyGain = selectedDates.length > 1 ? selectedDates.length - 1 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Block Availability
            {efficiencyGain > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                <Zap className="h-3 w-3 mr-1" />
                Bulk Mode
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: DATE SELECTION */}
        {currentStep === 'select_dates' && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Select Dates to Block</h3>
              <p className="text-muted-foreground">
                Choose one or more dates when you'll be unavailable. 
                {selectedDates.length > 1 && (
                  <span className="text-primary font-medium"> You can configure all {selectedDates.length} dates with the same settings!</span>
                )}
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Selected Dates ({selectedDates.length})</Label>
                  {efficiencyGain > 0 && (
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                      <Zap className="h-3 w-3 mr-1" />
                      Saves {efficiencyGain} form{efficiencyGain > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg bg-gray-50">
                  {selectedDates.map((date) => (
                    <Badge key={format(date, 'yyyy-MM-dd')} variant="secondary" className="flex items-center gap-1">
                      {format(date, 'MMM d')}
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

                {/* Efficiency messaging */}
                {efficiencyGain > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-900">Bulk Configuration Ready</span>
                    </div>
                    <p className="text-xs text-green-700">
                      Instead of filling out {selectedDates.length} separate forms, you'll configure all dates at once. 
                      Much more efficient! ⚡
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleProceedToBulkConfiguration} 
                disabled={selectedDates.length === 0}
                className="flex items-center gap-2"
              >
                {selectedDates.length > 1 ? (
                  <>
                    <Zap className="h-4 w-4" />
                    Configure All {selectedDates.length} Dates
                  </>
                ) : (
                  <>
                    Configure Date
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: TRUE BULK CONFIGURATION - Single form for ALL dates */}
        {currentStep === 'configure_bulk' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Configure Block Settings</h3>
                <p className="text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  These settings will apply to all {selectedDates.length} selected dates
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setCurrentStep('select_dates')}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Selection
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* SINGLE CONFIGURATION FORM */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Universal Block Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={form.handleSubmit(handleBulkSubmit)}
                    className="space-y-4"
                  >
                    {/* Block Type Selection */}
                    <div className="space-y-3">
                      <Label>Block Type</Label>
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

                    {/* Time Range for Partial Day */}
                    {form.watch('blockType') === 'partial_day' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Start Time</Label>
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
                          <Label>End Time</Label>
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

                    {/* Universal Reason */}
                    <div className="space-y-2">
                      <Label>Reason for Blocking</Label>
                      <Controller
                        name="reason"
                        control={form.control}
                        render={({ field }) => (
                          <Textarea
                            {...field}
                            placeholder={selectedDates.length > 1 
                              ? "e.g., Summer vacation, Conference attendance, Personal leave..." 
                              : "e.g., Doctor's appointment, Personal time..."
                            }
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

                    {/* Bulk Configuration Confirmation */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">
                          Bulk Configuration Active
                        </span>
                      </div>
                      <p className="text-xs text-blue-700 mb-2">
                        These settings will be applied to all {selectedDates.length} selected dates:
                      </p>
                      <div className="text-xs text-blue-600 space-y-1">
                        <div>• Block Type: {form.watch('blockType') === 'full_day' ? 'Full Day' : 'Partial Day'}</div>
                        {form.watch('blockType') === 'partial_day' && form.watch('startTime') && form.watch('endTime') && (
                          <div>• Time Range: {form.watch('startTime')} - {form.watch('endTime')}</div>
                        )}
                        <div>• Dates: {selectedDates.length} selected dates</div>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isSubmitting || !form.formState.isValid}
                      size="lg"
                    >
                      {isSubmitting ? (
                        'Blocking...'
                      ) : (
                        <span className="flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          Block All {selectedDates.length} Date{selectedDates.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* SUMMARY PANEL */}
              <Card>
                <CardHeader>
                  <CardTitle>Blocking Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm">
                      <span>Total dates:</span>
                      <span className="font-medium">{selectedDates.length}</span>
                    </div>
                    
                    {efficiencyGain > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Forms saved:</span>
                        <span className="font-medium text-green-600">+{efficiencyGain}</span>
                      </div>
                    )}
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Selected Dates</Label>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {selectedDates.map((date, index) => (
                          <div
                            key={format(date, 'yyyy-MM-dd')}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-sm text-sm"
                          >
                            <span className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-4">#{index + 1}</span>
                              {format(date, 'EEEE, MMM d, yyyy')}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              Ready
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Efficiency Celebration */}
                    {efficiencyGain > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-900">Efficiency Boost!</span>
                        </div>
                        <p className="text-xs text-green-700">
                          You're configuring {selectedDates.length} dates at once instead of individually. 
                          That's {efficiencyGain} fewer forms to fill out! 🎉
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