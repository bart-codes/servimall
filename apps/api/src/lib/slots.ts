import { dayOfWeek, toDate } from './time';

export interface WeeklyHours { day: number; open: string; close: string }
export interface DayOff { from: string; to: string }

export interface SlotInput {
  date: string; // YYYY-MM-DD in Kenya time
  weeklyHours: WeeklyHours[];
  daysOff: DayOff[];
  durationMinutes: number;
  intervalMinutes: number;
  leadTimeHours: number;
  now: Date;
}

/** Every start time a shop could offer on a date, before looking at existing bookings. */
export function generateSlotStarts(i: SlotInput): Date[] {
  if (i.daysOff.some((d) => i.date >= d.from && i.date <= d.to)) return [];
  const earliest = i.now.getTime() + i.leadTimeHours * 3600e3;
  const step = i.intervalMinutes * 60e3;
  const out: Date[] = [];
  for (const h of i.weeklyHours.filter((x) => x.day === dayOfWeek(i.date))) {
    const open = toDate(i.date, h.open).getTime();
    const close = toDate(i.date, h.close).getTime();
    for (let t = open; t + i.durationMinutes * 60e3 <= close; t += step) {
      if (t >= earliest) out.push(new Date(t));
    }
  }
  return out;
}

/** The time cells (ISO strings) a booking occupies. */
export function cellsFor(start: Date, durationMinutes: number, intervalMinutes: number): string[] {
  const n = Math.max(1, Math.ceil(durationMinutes / intervalMinutes));
  return Array.from({ length: n }, (_, k) => new Date(start.getTime() + k * intervalMinutes * 60e3).toISOString());
}

/** Keep only starts where every cell still has a free lane. */
export function freeStarts(
  starts: Date[],
  occupied: Map<string, number>,
  capacity: number,
  durationMinutes: number,
  intervalMinutes: number,
): Date[] {
  return starts.filter((s) =>
    cellsFor(s, durationMinutes, intervalMinutes).every((c) => (occupied.get(c) ?? 0) < capacity),
  );
}
