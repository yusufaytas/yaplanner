import { db } from './db';
import type { Cycle, CycleStatus } from './types';

const STANDARD_QUARTER_WEEKS = 13;
const STANDARD_QUARTER_DAYS = (STANDARD_QUARTER_WEEKS * 7) - 1;

export type CycleEditStatus = 'auto' | 'active' | 'closed' | 'archived';

export interface CycleDateDraft {
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

export function getDefaultCycleEndDate(startDate: string): string {
  return addDaysToIsoDate(startDate, STANDARD_QUARTER_DAYS);
}

export function updateCycleDraftStartDate(
  draft: CycleDateDraft,
  nextStartDate: string,
): CycleDateDraft {
  if (!nextStartDate) {
    return {
      startDate: '',
      endDate: '',
      endDateManuallyEdited: false,
    };
  }

  return {
    startDate: nextStartDate,
    endDate: draft.endDateManuallyEdited ? draft.endDate : getDefaultCycleEndDate(nextStartDate),
    endDateManuallyEdited: draft.endDateManuallyEdited,
  };
}

export function updateCycleDraftEndDate(
  draft: CycleDateDraft,
  nextEndDate: string,
): CycleDateDraft {
  return {
    ...draft,
    endDate: nextEndDate,
    endDateManuallyEdited: true,
  };
}

export function suggestNextCycle(last: { name: string; startDate: string; endDate: string }) {
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

export function getAutoCycleStatus(
  quarter: Pick<Cycle, 'startDate' | 'endDate' | 'status'>,
  today: string = getTodayIsoDate(),
): CycleStatus {
  // Manual overrides take precedence over date-based computation
  if (quarter.status === 'archived') return 'archived';
  if (quarter.status === 'active') return 'active';
  if (quarter.status === 'closed') return 'closed';
  // 'draft' stored value means "auto" — derive from dates
  if (today < quarter.startDate) return 'draft';
  if (today > quarter.endDate) return 'closed';
  return 'active';
}

export function getCycleEditStatus(status: CycleStatus): CycleEditStatus {
  if (status === 'archived') return 'archived';
  if (status === 'active') return 'active';
  if (status === 'closed') return 'closed';
  return 'auto';
}

export function getStoredCycleStatusForEditStatus(status: CycleEditStatus): CycleStatus {
  if (status === 'archived') return 'archived';
  if (status === 'active') return 'active';
  if (status === 'closed') return 'closed';
  return 'draft';
}

export function getActiveCycle(quarters: Cycle[], today: string = getTodayIsoDate()): Cycle | null {
  const activeCycles = quarters
    .filter((quarter) => getAutoCycleStatus(quarter, today) === 'active')
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return activeCycles[0] ?? null;
}

export function resolveCycleStatuses(quarters: Cycle[], today: string = getTodayIsoDate()): Cycle[] {
  return quarters.map((quarter) => ({
    ...quarter,
    status: getAutoCycleStatus(quarter, today),
  }));
}

export async function listResolvedCycles(): Promise<Cycle[]> {
  return resolveCycleStatuses(await db.cycles.toArray());
}


export async function getCyclesPageData() {
  return listResolvedCycles().then((allCycles) =>
    allCycles.sort((a, b) => b.startDate.localeCompare(a.startDate)),
  );
}

export async function createCycle(params: {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}) {
  const { id, name, startDate, endDate } = params;
  const { DEFAULT_OVERHEAD_ITEMS } = await import('./types');
  await db.cycles.add({
    id,
    name: name.trim(),
    startDate,
    endDate,
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdFromCycleId: null,
    capacityLineAfter: null,
    overhead: { items: DEFAULT_OVERHEAD_ITEMS.map((i) => ({ ...i })) },
  });
}

export async function updateCycle(
  cycleId: string,
  patch: Partial<Pick<Cycle, 'name' | 'startDate' | 'endDate' | 'status' | 'capacityLineAfter' | 'overhead'>>,
) {
  await db.cycles.update(cycleId, patch);
}

export async function getCycleLayoutData(cycleId: string) {
  const [rawCycle, resolvedCycles] = await Promise.all([
    db.cycles.get(cycleId),
    listResolvedCycles(),
  ]);
  return {
    rawCycle: rawCycle ?? null,
    quarter: resolvedCycles.find((q) => q.id === cycleId) ?? null,
  };
}

export async function getPortfolioDashboardData(cycleId: string) {
  const [quarter, cycleProjects, projects, people, cyclePeople, subteams, allocations] =
    await Promise.all([
      db.cycles.get(cycleId),
      db.cycleProjects.where('cycleId').equals(cycleId).toArray(),
      db.projects.toArray(),
      db.people.toArray(),
      db.cyclePeople.where('cycleId').equals(cycleId).toArray(),
      db.subteams.toArray(),
      db.allocations.where('cycleId').equals(cycleId).toArray(),
    ]);
  return { quarter, cycleProjects, projects, people, cyclePeople, subteams, allocations };
}

export async function getCyclePeoplePageData(cycleId: string) {
  const [quarter, people, subteams, cyclePeople, allocations] = await Promise.all([
    db.cycles.get(cycleId),
    db.people.orderBy('name').toArray(),
    db.subteams.toArray(),
    db.cyclePeople.where('cycleId').equals(cycleId).toArray(),
    db.allocations.where('cycleId').equals(cycleId).toArray(),
  ]);
  return { quarter: quarter ?? null, people, subteams, cyclePeople, allocations };
}

export async function addPersonToCycle(params: {
  id: string;
  cycleId: string;
  personId: string;
  subteamId: string | null;
  cycleCapacity: number;
}) {
  const { id, cycleId, personId, subteamId, cycleCapacity } = params;
  const existing = await db.cyclePeople.where({ cycleId, personId }).first();
  if (existing) {
    await db.cyclePeople.update(existing.id, {
      subteamId,
      inactive: false,
      cycleCapacity,
      overheadOverride: existing.overheadOverride ?? null,
    });
    return;
  }

  await db.cyclePeople.add({
    id,
    cycleId,
    personId,
    subteamId,
    inactive: false,
    cycleCapacity,
    overheadOverride: null,
  });
}

export async function removePersonFromCycle(cyclePersonId: string) {
  const cyclePerson = await db.cyclePeople.get(cyclePersonId);
  if (!cyclePerson) return;

  await db.transaction('rw', [db.cyclePeople, db.allocations], async () => {
    const allocations = await db.allocations.where({ cycleId: cyclePerson.cycleId, personId: cyclePerson.personId }).toArray();
    if (allocations.length > 0) {
      await db.allocations.bulkDelete(allocations.map((entry) => entry.id));
    }
    await db.cyclePeople.delete(cyclePersonId);
  });
}

export async function updateCyclePerson(
  cyclePersonId: string,
  patch: { inactive?: boolean; cycleCapacity?: number; overheadOverride?: import('./types').CapacityOverhead | null },
) {
  await db.cyclePeople.update(cyclePersonId, patch);
}

export async function getCapacityPlanningData(cycleId: string) {
  const [quarter, people, cyclePeople] = await Promise.all([
    db.cycles.get(cycleId),
    db.people.orderBy('name').toArray(),
    db.cyclePeople.where('cycleId').equals(cycleId).toArray(),
  ]);
  return { quarter: quarter ?? null, people, cyclePeople };
}

export async function savePriorityOrder(ordered: import('./types').CycleProject[]) {
  await db.transaction('rw', db.cycleProjects, async () => {
    for (let i = 0; i < ordered.length; i++) {
      await db.cycleProjects.update(ordered[i].id, { priority: i });
    }
  });
}

export async function updateCycleProjectEstimate(cycleProjectId: string, estimatedPersonWeeks: number) {
  await db.cycleProjects.update(cycleProjectId, { estimatedPersonWeeks });
}

export async function addProjectToCycle(plan: {
  cycleProjectToCreate: import('./types').CycleProject;
  cyclePeopleToCreate: import('./types').CyclePerson[];
  allocationsToCreate: import('./types').Allocation[];
}) {
  await db.transaction('rw', [db.cycleProjects, db.cyclePeople, db.allocations], async () => {
    const existingCycleProject = await db.cycleProjects.where({
      cycleId: plan.cycleProjectToCreate.cycleId,
      projectId: plan.cycleProjectToCreate.projectId,
    }).first();
    if (!existingCycleProject) {
      await db.cycleProjects.add(plan.cycleProjectToCreate);
    }

    if (plan.cyclePeopleToCreate.length > 0) {
      const existingCyclePeople = new Set(
        (await db.cyclePeople.where('cycleId').equals(plan.cycleProjectToCreate.cycleId).toArray())
          .map((entry) => `${entry.cycleId}::${entry.personId}`),
      );
      const cyclePeopleToCreate = plan.cyclePeopleToCreate.filter(
        (entry) => !existingCyclePeople.has(`${entry.cycleId}::${entry.personId}`),
      );
      if (cyclePeopleToCreate.length > 0) {
        await db.cyclePeople.bulkAdd(cyclePeopleToCreate);
      }
    }

    if (plan.allocationsToCreate.length > 0) {
      const existingAllocationKeys = new Set(
        (await db.allocations.where('cycleId').equals(plan.cycleProjectToCreate.cycleId).toArray())
          .map((entry) => `${entry.cycleId ?? ''}::${entry.personId}::${entry.projectId ?? ''}::${entry.role}::${entry.endDate ?? 'active'}`),
      );
      const allocationsToCreate = plan.allocationsToCreate.filter(
        (entry) => !existingAllocationKeys.has(`${entry.cycleId ?? ''}::${entry.personId}::${entry.projectId ?? ''}::${entry.role}::${entry.endDate ?? 'active'}`),
      );
      if (allocationsToCreate.length > 0) {
        await db.allocations.bulkAdd(allocationsToCreate);
      }
    }
  });
}

export async function getAddProjectToCycleData(cycleId: string, projectId: string) {
  const [allAllocations] = await Promise.all([
    db.allocations.where('projectId').equals(projectId).toArray(),
  ]);
  return { allAllocations };
}
