/**
 * Report time frames. Every report is scoped to an inclusive calendar date range
 * (YYYY-MM-DD, in the user's local time zone).
 */

export const TIMEFRAME_PRESETS = [
  'last_two_weeks',
  'current_week',
  'current_month',
  'last_month',
  'current_quarter',
  'last_quarter',
  'current_year',
  'last_year',
  'custom',
] as const;

export type TimeframePreset = (typeof TIMEFRAME_PRESETS)[number];

export const DEFAULT_TIMEFRAME = 'last_two_weeks' satisfies TimeframePreset;

export const TIMEFRAME_LABELS: Record<TimeframePreset, string> = {
  last_two_weeks: 'Last two weeks',
  current_week: 'Current week',
  current_month: 'Current month',
  last_month: 'Last month',
  current_quarter: 'Current quarter',
  last_quarter: 'Last quarter',
  current_year: 'Current year',
  last_year: 'Last year',
  custom: 'Custom range',
};

/** Inclusive calendar date range. */
export interface DateRange {
  from: string;
  to: string;
}

export type TimeframeInput =
  | { preset: Exclude<TimeframePreset, 'custom'> }
  | { preset: 'custom'; from: string; to: string };

export class TimeframeError extends Error {
  override name = 'TimeframeError';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Calendar math is done on UTC-midnight Date objects so DST never shifts a day.
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function parseIsoDate(value: string): Date {
  if (!ISO_DATE.test(value)) throw new TimeframeError(`Invalid date "${value}", expected YYYY-MM-DD`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || toIso(d) !== value) throw new TimeframeError(`Invalid date "${value}"`);
  return d;
}

/** Today's date in the local time zone as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isTimeframePreset(value: unknown): value is TimeframePreset {
  return typeof value === 'string' && (TIMEFRAME_PRESETS as readonly string[]).includes(value);
}

/**
 * Resolves a time frame into an inclusive date range. "Current" periods end today;
 * "last" periods cover the whole previous period. Weeks start on Monday.
 * Custom ranges must be ordered and span at most one year.
 */
export function resolveTimeframe(input: TimeframeInput, today: string = localToday()): DateRange {
  const t = parseIsoDate(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const quarterStart = Math.floor(m / 3) * 3;
  const range = (from: Date, to: Date): DateRange => ({ from: toIso(from), to: toIso(to) });

  switch (input.preset) {
    case 'last_two_weeks':
      return range(addDays(t, -13), t);
    case 'current_week':
      return range(addDays(t, -((t.getUTCDay() + 6) % 7)), t);
    case 'current_month':
      return range(utc(y, m, 1), t);
    case 'last_month':
      return range(utc(y, m - 1, 1), utc(y, m, 0));
    case 'current_quarter':
      return range(utc(y, quarterStart, 1), t);
    case 'last_quarter':
      return range(utc(y, quarterStart - 3, 1), utc(y, quarterStart, 0));
    case 'current_year':
      return range(utc(y, 0, 1), t);
    case 'last_year':
      return range(utc(y - 1, 0, 1), utc(y - 1, 11, 31));
    case 'custom': {
      const from = parseIsoDate(input.from);
      const to = parseIsoDate(input.to);
      if (to < from) throw new TimeframeError('The end date must be on or after the start date');
      const oneYearLater = utc(from.getUTCFullYear() + 1, from.getUTCMonth(), from.getUTCDate());
      if (to >= oneYearLater) throw new TimeframeError('A custom range cannot exceed one year');
      return range(from, to);
    }
  }
}

/** Converts an inclusive local date range into a half-open [since, until) instant range. */
export function rangeToInstants(range: DateRange): { since: Date; until: Date } {
  const since = new Date(`${range.from}T00:00:00`);
  const until = new Date(`${range.to}T00:00:00`);
  until.setDate(until.getDate() + 1);
  return { since, until };
}
