// Phase 1: Recurring Sessions - Shared scheduling types

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, etc.

export interface ClientTimePreference {
  id: string;
  client_id: string;
  weekday: number; // Database stores as integer
  start_time: string; // Format: "HH:mm:ss" (e.g., "07:00:00")
  end_time?: string; // Optional end time
  flex_minutes: number; // 0-180 minutes flexibility
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTimePreferenceInput {
  weekday: number; // Accept any integer for flexibility
  start_time: string;
  end_time?: string;
  flex_minutes: number;
  notes?: string;
  is_active: boolean;
}

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday', 
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday'
};

export const WEEKDAY_ABBREVIATIONS: Record<Weekday, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue', 
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat'
};

// Flex minutes options
export const FLEX_MINUTES_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 15, label: '15 mins' },
  { value: 30, label: '30 mins' },
  { value: 45, label: '45 mins' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' }
];