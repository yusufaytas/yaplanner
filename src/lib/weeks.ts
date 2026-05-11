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

/**
 * Returns the precise duration of the quarter in weeks based on the inclusive
 * day range, rather than the number of overlapping Monday buckets.
 */
export function getQuarterDurationWeeks(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const inclusiveDays = ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return inclusiveDays > 0 ? inclusiveDays / 7 : 0;
}
