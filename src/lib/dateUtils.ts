/**
 * Date and timezone utilities for Halo Lifestyle Mode
 * Ensures consistent date boundaries using IANA timezone strings and UTC-based date math.
 */

/**
 * Returns YYYY-MM-DD for a given Date object in the specified IANA timezone.
 */
export function dateInTimezone(date: Date, timeZone: string): string {
  // Format parts to safely construct YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Returns today's date (YYYY-MM-DD) in the specified user timezone.
 * Defaults to 'Asia/Manila' if timezone is invalid or unspecified.
 */
export function todayInTimezone(timeZone?: string | null): string {
  const tz = timeZone?.trim() || 'Asia/Manila';
  try {
    return dateInTimezone(new Date(), tz);
  } catch {
    return dateInTimezone(new Date(), 'Asia/Manila');
  }
}

/**
 * Adds an integer number of days to a YYYY-MM-DD date string.
 * Uses UTC components so DST transitions never shift or distort the calendar day.
 */
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dt = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dt}`;
}

/**
 * Returns the day of the week for a YYYY-MM-DD date string.
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday (matches routine_entries.day_of_week).
 */
export function getWeekday(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCDay();
}

/**
 * Compares two YYYY-MM-DD date strings.
 * Returns negative if a < b, 0 if a === b, positive if a > b.
 */
export function compareDates(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Returns true if a <= b (inclusive).
 */
export function isSameOrBefore(a: string, b: string): boolean {
  return a <= b;
}

/**
 * Returns true if a >= b (inclusive).
 */
export function isSameOrAfter(a: string, b: string): boolean {
  return a >= b;
}

/**
 * Difference in days between two YYYY-MM-DD date strings (b - a).
 */
export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  const utcA = Date.UTC(y1, m1 - 1, d1);
  const utcB = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

/**
 * Formats a YYYY-MM-DD date into human-readable text (e.g. "Mon, Oct 28").
 */
export function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
