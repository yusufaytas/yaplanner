import { db } from './db';
import type { Quarter, QuarterStatus } from './types';

const STANDARD_QUARTER_WEEKS = 13;
const STANDARD_QUARTER_DAYS = (STANDARD_QUARTER_WEEKS * 7) - 1;

export type QuarterEditStatus = 'auto' | 'active' | 'closed' | 'archived';

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
  // Manual overrides take precedence over date-based computation
  if (quarter.status === 'archived') return 'archived';
  if (quarter.status === 'active') return 'active';
  if (quarter.status === 'closed') return 'closed';
  // 'draft' stored value means "auto" — derive from dates
  if (today < quarter.startDate) return 'draft';
  if (today > quarter.endDate) return 'closed';
  return 'active';
}

export function getQuarterEditStatus(status: QuarterStatus): QuarterEditStatus {
  if (status === 'archived') return 'archived';
  if (status === 'active') return 'active';
  if (status === 'closed') return 'closed';
  return 'auto';
}

export function getStoredQuarterStatusForEditStatus(status: QuarterEditStatus): QuarterStatus {
  if (status === 'archived') return 'archived';
  if (status === 'active') return 'active';
  if (status === 'closed') return 'closed';
  return 'draft';
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


export async function getQuartersPageData() {
  return listResolvedQuarters().then((allQuarters) =>
    allQuarters.sort((a, b) => b.startDate.localeCompare(a.startDate)),
  );
}

export async function createQuarter(params: {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}) {
  const { id, name, startDate, endDate } = params;
  const { DEFAULT_OVERHEAD_ITEMS } = await import('./types');
  await db.quarters.add({
    id,
    name: name.trim(),
    startDate,
    endDate,
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdFromQuarterId: null,
    capacityLineAfter: null,
    overhead: { items: DEFAULT_OVERHEAD_ITEMS.map((i) => ({ ...i })) },
  });
}

export async function updateQuarter(
  quarterId: string,
  patch: Partial<Pick<Quarter, 'name' | 'startDate' | 'endDate' | 'status' | 'capacityLineAfter' | 'overhead'>>,
) {
  await db.quarters.update(quarterId, patch);
}

export async function getQuarterLayoutData(quarterId: string) {
  const [rawQuarter, resolvedQuarters] = await Promise.all([
    db.quarters.get(quarterId),
    listResolvedQuarters(),
  ]);
  return {
    rawQuarter: rawQuarter ?? null,
    quarter: resolvedQuarters.find((q) => q.id === quarterId) ?? null,
  };
}

export async function getPortfolioDashboardData(quarterId: string) {
  const [quarter, quarterProjects, projects, people, quarterPeople, subteams, allocations] =
    await Promise.all([
      db.quarters.get(quarterId),
      db.quarterProjects.where('quarterId').equals(quarterId).toArray(),
      db.projects.toArray(),
      db.people.toArray(),
      db.quarterPeople.where('quarterId').equals(quarterId).toArray(),
      db.subteams.toArray(),
      db.allocations.where('quarterId').equals(quarterId).toArray(),
    ]);
  return { quarter, quarterProjects, projects, people, quarterPeople, subteams, allocations };
}

export async function getQuarterPeoplePageData(quarterId: string) {
  const [quarter, people, subteams, quarterPeople, allocations] = await Promise.all([
    db.quarters.get(quarterId),
    db.people.orderBy('name').toArray(),
    db.subteams.toArray(),
    db.quarterPeople.where('quarterId').equals(quarterId).toArray(),
    db.allocations.where('quarterId').equals(quarterId).toArray(),
  ]);
  return { quarter: quarter ?? null, people, subteams, quarterPeople, allocations };
}

export async function addPersonToQuarter(params: {
  id: string;
  quarterId: string;
  personId: string;
  subteamId: string | null;
  quarterCapacity: number;
}) {
  const { id, quarterId, personId, subteamId, quarterCapacity } = params;
  await db.quarterPeople.add({
    id,
    quarterId,
    personId,
    subteamId,
    inactive: false,
    quarterCapacity,
    overheadOverride: null,
  });
}

export async function removePersonFromQuarter(quarterPersonId: string) {
  await db.quarterPeople.delete(quarterPersonId);
}

export async function updateQuarterPerson(
  quarterPersonId: string,
  patch: { inactive?: boolean; quarterCapacity?: number; overheadOverride?: import('./types').CapacityOverhead | null },
) {
  await db.quarterPeople.update(quarterPersonId, patch);
}

export async function getCapacityPlanningData(quarterId: string) {
  const [quarter, people, quarterPeople] = await Promise.all([
    db.quarters.get(quarterId),
    db.people.orderBy('name').toArray(),
    db.quarterPeople.where('quarterId').equals(quarterId).toArray(),
  ]);
  return { quarter: quarter ?? null, people, quarterPeople };
}

export async function savePriorityOrder(ordered: import('./types').QuarterProject[]) {
  await db.transaction('rw', db.quarterProjects, async () => {
    for (let i = 0; i < ordered.length; i++) {
      await db.quarterProjects.update(ordered[i].id, { priority: i });
    }
  });
}

export async function updateQuarterProjectEstimate(quarterProjectId: string, estimatedPersonWeeks: number) {
  await db.quarterProjects.update(quarterProjectId, { estimatedPersonWeeks });
}

export async function addProjectToQuarter(plan: {
  quarterProjectToCreate: import('./types').QuarterProject;
  quarterPeopleToCreate: import('./types').QuarterPerson[];
  allocationsToCreate: import('./types').Allocation[];
}) {
  await db.transaction('rw', [db.quarterProjects, db.quarterPeople, db.allocations], async () => {
    await db.quarterProjects.add(plan.quarterProjectToCreate);
    if (plan.quarterPeopleToCreate.length > 0) {
      await db.quarterPeople.bulkAdd(plan.quarterPeopleToCreate);
    }
    if (plan.allocationsToCreate.length > 0) {
      await db.allocations.bulkAdd(plan.allocationsToCreate);
    }
  });
}

export async function getAddProjectToQuarterData(quarterId: string, projectId: string) {
  const [allAllocations] = await Promise.all([
    db.allocations.where('projectId').equals(projectId).toArray(),
  ]);
  return { allAllocations };
}
