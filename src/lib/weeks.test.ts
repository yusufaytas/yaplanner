import { describe, it, expect } from 'vitest';
import { getQuarterWeeks } from './weeks';

/**
 * Unit tests for getQuarterWeeks
 * Validates Requirements 5.1, 6.1
 */
describe('getQuarterWeeks', () => {
  it('returns an array where every entry is a Monday', () => {
    const weeks = getQuarterWeeks('2026-06-29', '2026-09-27');
    for (const weekStart of weeks) {
      const date = new Date(weekStart);
      // getUTCDay(): 0=Sunday, 1=Monday
      expect(date.getUTCDay()).toBe(1);
    }
  });

  it('includes boundary weeks that overlap the range', () => {
    // startDate is a Wednesday — the Monday of that week should be included
    const weeks = getQuarterWeeks('2026-07-01', '2026-07-14');
    // 2026-07-01 is a Wednesday; the Monday of that week is 2026-06-29
    expect(weeks[0]).toBe('2026-06-29');
    // 2026-07-14 is a Tuesday; the Monday of that week is 2026-07-13
    expect(weeks[weeks.length - 1]).toBe('2026-07-13');
  });

  it('returns exactly 13 entries for a standard 13-week quarter', () => {
    // 2026-Q3: Mon 2026-06-29 → Sun 2026-09-27 = 13 weeks
    const weeks = getQuarterWeeks('2026-06-29', '2026-09-27');
    expect(weeks).toHaveLength(13);
  });

  it('returns exactly 1 entry when start and end are in the same week', () => {
    // Both dates fall in the week of Mon 2026-07-06
    const weeks = getQuarterWeeks('2026-07-06', '2026-07-10');
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toBe('2026-07-06');
  });

  it('returns a single week when startDate equals endDate (a Monday)', () => {
    const weeks = getQuarterWeeks('2026-07-06', '2026-07-06');
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toBe('2026-07-06');
  });

  it('returns ISO date strings in YYYY-MM-DD format', () => {
    const weeks = getQuarterWeeks('2026-06-29', '2026-07-12');
    for (const w of weeks) {
      expect(w).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('returns weeks in ascending chronological order', () => {
    const weeks = getQuarterWeeks('2026-06-29', '2026-09-27');
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i] > weeks[i - 1]).toBe(true);
    }
  });

  it('handles a startDate that is a Sunday (edge: day before Monday)', () => {
    // 2026-07-05 is a Sunday; the Monday of that week is 2026-06-29
    const weeks = getQuarterWeeks('2026-07-05', '2026-07-05');
    expect(weeks[0]).toBe('2026-06-29');
    expect(weeks).toHaveLength(1);
  });
});
