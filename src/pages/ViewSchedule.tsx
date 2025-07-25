import React, { useState } from 'react';
import { DashboardNavigation } from '@/components/Navigation';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export default function ViewSchedule() {
  const [currentView, setCurrentView] = useState<'day' | 'week' | 'month'>('week');

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-heading-1 mb-6">My Schedule</h1>

        <div className="flex justify-center mb-6">
          <ToggleGroup type="single" value={currentView} onValueChange={(value: 'day' | 'week' | 'month') => {
            if (value) setCurrentView(value);
          }}>
            <ToggleGroupItem value="day" aria-label="Toggle day view">
              Day
            </ToggleGroupItem>
            <ToggleGroupItem value="week" aria-label="Toggle week view">
              Week
            </ToggleGroupItem>
            <ToggleGroupItem value="month" aria-label="Toggle month view">
              Month
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="calendar-placeholder border rounded-lg p-8 bg-white shadow-sm h-[600px] flex items-center justify-center text-gray-500 text-xl">
          {/* Placeholder for Calendar Grid */}
          Calendar Grid ({currentView} view)
        </div>
      </main>
    </div>
  );
}