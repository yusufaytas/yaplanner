/**
 * Returns an array of ISO date strings (YYYY-MM-DD) for the Monday of each
 * week that overlaps the given quarter date range.
 *
 * A week overlaps the range if its Monday falls on or before endDate AND
 * its Sunday falls on or after startDate.
 */
export function getQuarterWeeks(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Find the Monday on or before startDate
  const firstMonday = new Date(start);
  const dayOfWeek = firstMonday.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  firstMonday.setUTCDate(firstMonday.getUTCDate() + daysToMonday);

  const weeks: string[] = [];
  const cursor = new Date(firstMonday);

  while (cursor <= end) {
    weeks.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return weeks;
}

/** Format a week start date as a short label, e.g. "W27" or "Jun 30" */
export function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart);
  const month = date.toLocaleString('en', { month: 'short', timeZone: 'UTC' });
  const day = date.getUTCDate();
  return `${month} ${day}`;
}

/** Returns true if the given ISO date falls within [weekStart, weekStart+6d] */
export function dateIsInWeek(date: string, weekStart: string): boolean {
  const d = new Date(date);
  const ws = new Date(weekStart);
  const we = new Date(weekStart);
  we.setUTCDate(we.getUTCDate() + 6);
  return d >= ws && d <= we;
}

/** Returns true if a date range [rangeStart, rangeEnd] overlaps a week [weekStart, weekStart+6d] */
export function rangeOverlapsWeek(
  rangeStart: string,
  rangeEnd: string,
  weekStart: string,
): boolean {
  const rs = new Date(rangeStart);
  const re = new Date(rangeEnd);
  const ws = new Date(weekStart);
  const we = new Date(weekStart);
  we.setUTCDate(we.getUTCDate() + 6);
  return rs <= we && re >= ws;
}
