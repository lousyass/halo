import { describe, it, expect } from 'vitest';
import {
  addDays,
  compareDates,
  dateInTimezone,
  diffDays,
  formatDisplayDate,
  getWeekday,
  isSameOrBefore,
  todayInTimezone,
} from './dateUtils';

describe('dateUtils', () => {
  it('correctly handles timezone boundaries (e.g. Manila vs Dhaka at 2026-03-01T17:30:00Z)', () => {
    // 2026-03-01T17:30:00Z:
    // UTC+6 (Asia/Dhaka): 23:30 on 2026-03-01 -> '2026-03-01'
    // UTC+8 (Asia/Manila): 01:30 on 2026-03-02 -> '2026-03-02'
    const testDate = new Date('2026-03-01T17:30:00Z');

    const dhakaDate = dateInTimezone(testDate, 'Asia/Dhaka');
    const manilaDate = dateInTimezone(testDate, 'Asia/Manila');

    expect(dhakaDate).toBe('2026-03-01');
    expect(manilaDate).toBe('2026-03-02');
  });

  it('adds days accurately without DST drift', () => {
    expect(addDays('2026-03-01', 1)).toBe('2026-03-02');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // 2026 is non-leap year
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-10-31', 5)).toBe('2026-11-05');
  });

  it('computes weekday correctly (0 = Sun, ..., 6 = Sat)', () => {
    // 2026-03-01 is Sunday
    expect(getWeekday('2026-03-01')).toBe(0);
    // 2026-03-02 is Monday
    expect(getWeekday('2026-03-02')).toBe(1);
    // 2026-03-07 is Saturday
    expect(getWeekday('2026-03-07')).toBe(6);
  });

  it('compares and diffs dates', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBeLessThan(0);
    expect(compareDates('2026-01-02', '2026-01-01')).toBeGreaterThan(0);
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0);

    expect(isSameOrBefore('2026-01-01', '2026-01-02')).toBe(true);
    expect(diffDays('2026-03-01', '2026-03-10')).toBe(9);
    expect(diffDays('2026-03-10', '2026-03-01')).toBe(-9);
  });

  it('formats display date', () => {
    expect(formatDisplayDate('2026-03-01')).toContain('Mar 1');
  });

  it('provides fallback for todayInTimezone when invalid timezone passed', () => {
    const today = todayInTimezone('Invalid/Timezone');
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
