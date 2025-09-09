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
import { CalendarDays, Clock, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { generateTimeOptions } from '@/lib/availabilityUtils';

const timeOptions = generateTimeOptions();

// Form validation schema
const BlockConfigurationSchema = z.object({
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

type BlockConfigurationFormData = z.infer<typeof BlockConfigurationSchema>;

interface SelectedDateConfig extends BlockConfigurationFormData {
  date: Date;
}

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
  const [currentStep, setCurrentStep] = useState<'select_dates' | 'configure_blocks'>('select_dates');
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [configuredBlocks, setConfiguredBlocks] = useState<SelectedDateConfig[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form for configuring individual blocks
  const form = useForm<BlockConfigurationFormData>({
    resolver: zodResolver(BlockConfigurationSchema),
    defaultValues: {
      blockType: 'full_day',
      reason: '',
    },
  });

  // Reset modal state when closing
  const handleClose = () => {
    setCurrentStep('select_dates');
    setSelectedDates([]);
    setConfiguredBlocks([]);
    form.reset();
    onClose();
  };

  // Move to configuration step
  const handleProceedToConfiguration = () => {
    if (selectedDates.length === 0) {
      toast({
        title: "No dates selected",
        description: "Please select at least one date to block.",
        variant: "destructive",
      });
      return;
    }
    setCurrentStep('configure_blocks');
  };

  // Configure a specific date
  const handleConfigureDate = (dateToConfig: Date, formData: BlockConfigurationFormData) => {
    const newConfig: SelectedDateConfig = {
      date: dateToConfig,
      ...formData,
    };

    setConfiguredBlocks(prev => {
      const filtered = prev.filter(config => 
        format(config.date, 'yyyy-MM-dd') !== format(dateToConfig, 'yyyy-MM-dd')
      );
      return [...filtered, newConfig];
    });

    form.reset({
      blockType: 'full_day',
      reason: '',
    });
  };

  // Submit all blocks
  const handleSubmitAllBlocks = async () => {
    if (configuredBlocks.length !== selectedDates.length) {
      toast({
        title: "Configuration incomplete",
        description: "Please configure all selected dates before submitting.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare batch insert data
      const exceptionsToInsert = configuredBlocks.map(config => ({
        trainer_id: trainerId,
        exception_date: format(config.date, 'yyyy-MM-dd'),
        exception_type: config.blockType === 'full_day' ? 'unavailable_full_day' : 'unavailable_partial_day',
        start_time: config.blockType === 'partial_day' ? config.startTime : null,
        end_time: config.blockType === 'partial_day' ? config.endTime : null,
        is_available: false,
        notes: config.reason,
      }));

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
      toast({
        title: "Availability blocked successfully",
        description: `Successfully blocked ${configuredBlocks.length} period${configuredBlocks.length > 1 ? 's' : ''}.`,
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

  // Get unconfigured dates
  const unconfiguredDates = selectedDates.filter(date => 
    !configuredBlocks.some(config => 
      format(config.date, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    )
  );

  // Current date being configured
  const currentDateToConfig = unconfiguredDates[0];

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
                Choose one or more dates when you'll be unavailable for sessions.
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
                <div className="flex flex-wrap gap-2">
                  {selectedDates.map((date) => (
                    <Badge key={format(date, 'yyyy-MM-dd')} variant="secondary">
                      {format(date, 'MMM d, yyyy')}
                      <button
                        onClick={() => setSelectedDates(prev => 
                          prev.filter(d => format(d, 'yyyy-MM-dd') !== format(date, 'yyyy-MM-dd'))
                        )}
                        className="ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleProceedToConfiguration} disabled={selectedDates.length === 0}>
                Continue to Configuration
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Configuration */}
        {currentStep === 'configure_blocks' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Configure Blocked Periods</h3>
                <p className="text-muted-foreground">
                  Set up each blocked period with specific details.
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
                    {currentDateToConfig ? (
                      <>Configure: {format(currentDateToConfig, 'MMM d, yyyy')}</>
                    ) : (
                      'All Dates Configured'
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {currentDateToConfig ? (
                    <form
                      onSubmit={form.handleSubmit((data) => 
                        handleConfigureDate(currentDateToConfig, data)
                      )}
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
                              placeholder="e.g., Personal appointment, Holiday, Sick leave..."
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

                      <Button type="submit" className="w-full">
                        Configure This Date
                      </Button>
                    </form>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">
                        All dates have been configured!
                      </p>
                      <Button 
                        onClick={handleSubmitAllBlocks}
                        disabled={isSubmitting}
                        className="w-full"
                      >
                        {isSubmitting ? 'Submitting...' : 'Block All Periods'}
                      </Button>
                    </div>
                  )}
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
                    <div className="flex justify-between text-sm">
                      <span>Configured:</span>
                      <span className="font-medium">{configuredBlocks.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Remaining:</span>
                      <span className="font-medium">{unconfiguredDates.length}</span>
                    </div>

                    {configuredBlocks.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Configured Periods</Label>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {configuredBlocks.map((config) => (
                              <div
                                key={format(config.date, 'yyyy-MM-dd')}
                                className="p-2 border rounded-sm space-y-1"
                              >
                                <div className="flex justify-between items-start">
                                  <span className="text-sm font-medium">
                                    {format(config.date, 'MMM d, yyyy')}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {config.blockType === 'full_day' ? 'Full Day' : 'Partial'}
                                  </Badge>
                                </div>
                                {config.blockType === 'partial_day' && (
                                  <p className="text-xs text-muted-foreground">
                                    {config.startTime} - {config.endTime}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {config.reason}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              {unconfiguredDates.length === 0 && (
                <Button 
                  onClick={handleSubmitAllBlocks}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : `Block ${configuredBlocks.length} Period${configuredBlocks.length > 1 ? 's' : ''}`}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}