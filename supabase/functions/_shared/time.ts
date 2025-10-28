import { fromZonedTime } from 'https://esm.sh/date-fns-tz@3.0.0';

const TRAINER_TZ = 'Australia/Melbourne';

export function toUtcIso(dateStr: string, timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const wall = new Date(`${dateStr}T00:00:00`);
  wall.setHours(h, m, 0, 0);
  return fromZonedTime(wall, TRAINER_TZ).toISOString();
}
