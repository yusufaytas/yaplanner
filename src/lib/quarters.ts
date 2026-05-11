import { db } from './db';
import type { Quarter, QuarterStatus } from './types';

const STANDARD_QUARTER_WEEKS = 13;
const STANDARD_QUARTER_DAYS = (STANDARD_QUARTER_WEEKS * 7) - 1;

export type QuarterEditStatus = 'auto' | 'archived';

export interface QuarterDateDraft {
  startDate: string;
  endDate: string;
  endDateManuallyEdited: boolean;
}

export function getTodayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getDefaultQuarterEndDate(startDate: string): string {
  return addDaysToIsoDate(startDate, STANDARD_QUARTER_DAYS);
}

export function updateQuarterDraftStartDate(
  draft: QuarterDateDraft,
  nextStartDate: string,
): QuarterDateDraft {
  if (!nextStartDate) {
    return {
      startDate: '',
      endDate: '',
      endDateManuallyEdited: false,
    };
  }

  return {
    startDate: nextStartDate,
    endDate: draft.endDateManuallyEdited ? draft.endDate : getDefaultQuarterEndDate(nextStartDate),
    endDateManuallyEdited: draft.endDateManuallyEdited,
  };
}

export function updateQuarterDraftEndDate(
  draft: QuarterDateDraft,
  nextEndDate: string,
): QuarterDateDraft {
  return {
    ...draft,
    endDate: nextEndDate,
    endDateManuallyEdited: true,
  };
}

export function suggestNextQuarter(last: { name: string; startDate: string; endDate: string }) {
  const nextStart = addDaysToIsoDate(last.endDate, 1);

  const lastStart = new Date(last.startDate);
  const lastEnd = new Date(last.endDate);
  const durationDays = Math.round((lastEnd.getTime() - lastStart.getTime()) / (1000 * 60 * 60 * 24));
  const nextEnd = addDaysToIsoDate(nextStart, durationDays);

  const match = last.name.match(/^(\d{4})-Q([1-4])$/);
  let nextName = '';
  if (match) {
    const year = parseInt(match[1], 10);
    const q = parseInt(match[2], 10);
    nextName = q === 4 ? `${year + 1}-Q1` : `${year}-Q${q + 1}`;
  }

  return { name: nextName, startDate: nextStart, endDate: nextEnd };
}

export function getAutoQuarterStatus(
  quarter: Pick<Quarter, 'startDate' | 'endDate' | 'status'>,
  today: string = getTodayIsoDate(),
): QuarterStatus {
  if (quarter.status === 'archived') return 'archived';
  if (today < quarter.startDate) return 'draft';
  if (today > quarter.endDate) return 'closed';
  return 'active';
}

export function getQuarterEditStatus(status: QuarterStatus): QuarterEditStatus {
  return status === 'archived' ? 'archived' : 'auto';
}

export function getStoredQuarterStatusForEditStatus(status: QuarterEditStatus): QuarterStatus {
  return status === 'archived' ? 'archived' : 'draft';
}

export function getActiveQuarter(quarters: Quarter[], today: string = getTodayIsoDate()): Quarter | null {
  const activeQuarters = quarters
    .filter((quarter) => getAutoQuarterStatus(quarter, today) === 'active')
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return activeQuarters[0] ?? null;
}

export function resolveQuarterStatuses(quarters: Quarter[], today: string = getTodayIsoDate()): Quarter[] {
  return quarters.map((quarter) => ({
    ...quarter,
    status: getAutoQuarterStatus(quarter, today),
  }));
}

export async function listResolvedQuarters(): Promise<Quarter[]> {
  return resolveQuarterStatuses(await db.quarters.toArray());
}

export async function syncQuarterStatuses(): Promise<Quarter[]> {
  const quarters = await db.quarters.toArray();
  const today = getTodayIsoDate();
  const statusUpdates = quarters
    .map((quarter) => ({ id: quarter.id, status: getAutoQuarterStatus(quarter, today) }))
    .filter((update) => quarters.find((quarter) => quarter.id === update.id)?.status !== update.status);

  if (statusUpdates.length > 0) {
    await db.transaction('rw', db.quarters, async () => {
      for (const update of statusUpdates) {
        await db.quarters.update(update.id, { status: update.status });
      }
    });
  }

  return resolveQuarterStatuses(quarters, today);
}
