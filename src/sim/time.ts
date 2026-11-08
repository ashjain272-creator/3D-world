/** Simulation calendar. One sim year = 12 months × 30 days. Time unit: minutes. */

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 60 * 24;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
export const MINUTES_PER_YEAR = MINUTES_PER_DAY * DAYS_PER_YEAR;

export const MONTH_NAMES = [
  'Dawnfall', 'Seedrise', 'Highbloom', 'Suncrest', 'Emberwane', 'Harvestmoon',
  'Starfall', 'Mistveil', 'Frostlight', 'Deepwinter', 'Thawing', 'Kindling',
];

export interface CalendarDate {
  year: number;
  month: number; // 0-based
  day: number; // 1-based
  hour: number;
  minute: number;
}

export function toDate(time: number, epochYear: number): CalendarDate {
  const t = Math.floor(time);
  const totalDays = Math.floor(t / MINUTES_PER_DAY);
  const minuteOfDay = ((t % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const year = Math.floor(totalDays / DAYS_PER_YEAR);
  const dayOfYear = totalDays - year * DAYS_PER_YEAR;
  return {
    year: epochYear + year,
    month: Math.floor(dayOfYear / DAYS_PER_MONTH),
    day: (dayOfYear % DAYS_PER_MONTH) + 1,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  };
}

export function formatDate(time: number, epochYear: number, withTime = false): string {
  const d = toDate(time, epochYear);
  const base = `${d.day} ${MONTH_NAMES[d.month]} ${d.year}`;
  if (!withTime) return base;
  return `${base} · ${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
}

export function formatShortDate(time: number, epochYear: number): string {
  const d = toDate(time, epochYear);
  return `${MONTH_NAMES[d.month].slice(0, 3)} ${d.year}`;
}

/** Hour of day as a float 0..24. */
export function hourOfDay(time: number): number {
  return (((time % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60;
}

export function dayIndex(time: number): number {
  return Math.floor(time / MINUTES_PER_DAY);
}

export function yearsBetween(a: number, b: number): number {
  return (b - a) / MINUTES_PER_YEAR;
}

export function formatDuration(minutes: number): string {
  const m = Math.abs(minutes);
  if (m < 60) return `${Math.round(m)} min`;
  if (m < MINUTES_PER_DAY) return `${(m / 60).toFixed(1)} h`;
  if (m < MINUTES_PER_DAY * DAYS_PER_MONTH) return `${Math.round(m / MINUTES_PER_DAY)} days`;
  if (m < MINUTES_PER_YEAR) return `${(m / (MINUTES_PER_DAY * DAYS_PER_MONTH)).toFixed(1)} months`;
  return `${(m / MINUTES_PER_YEAR).toFixed(1)} years`;
}

/** Simulation speed presets: sim minutes advanced per real second. */
export const SPEEDS = [
  { id: 0, label: 'Paused', short: '❚❚', rate: 0 },
  { id: 1, label: 'Real-time', short: '1×', rate: 10 },
  { id: 2, label: 'Fast', short: '2×', rate: 60 },
  { id: 3, label: 'Faster', short: '3×', rate: 60 * 6 },
  { id: 4, label: 'Rapid', short: '4×', rate: MINUTES_PER_DAY },
  { id: 5, label: 'Epochal', short: '5×', rate: MINUTES_PER_DAY * 7 },
] as const;
