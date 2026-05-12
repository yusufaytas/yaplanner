import {
  computeEffectiveCapacity,
  resolveOverhead,
  type Allocation,
  type CapacityOverhead,
  type Person,
  type Cycle,
  type CyclePerson,
  type Role,
} from './types';
import { getCycleDurationWeeks } from './weeks';

export interface PersonProjectCapacityShare {
  projectId: string;
  percentage: number;
  isEvenSplit: boolean;
}

export interface ProjectCapacitySummary {
  estimatedPersonWeeks: number | null;
  reservedPersonWeeks: number;
  reservedWeeklyPeople: number;
  remainingPersonWeeks: number | null;
}

export interface CycleCapacitySummary {
  totalAvailablePersonWeeks: number;
  totalAvailableWeeklyPeople: number;
}

export interface CyclePersonCapacitySummary {
  baseCapacity: number;
  effectiveCapacity: number;
  availableWeeks: number;
  usesOverride: boolean;
  overhead: CapacityOverhead;
}

export interface CyclePersonProjectSummary {
  tracksCapacity: boolean;
  availableWeeks: number;
  capacityLimit: number;
  totalAllocatedPct: number;
  effectiveCapacity: number;
  allocatedWeeks: number;
  remainingWeeks: number;
  remainingPct: number;
  overAllocated: boolean;
}

function uniqueProjectIds(projectIds: Array<string | null | undefined>): string[] {
  return [...new Set(projectIds.filter((projectId): projectId is string => Boolean(projectId)))];
}

function isActiveAllocation(allocation: Allocation): boolean {
  return allocation.endDate === null;
}

export function personTracksCapacity(role: Role | string): boolean {
  return role === 'Engineer' || role === 'DRI';
}

export function getPersonCapacityLimit(
  person: Pick<Person, 'defaultCapacity'>,
  quarter?: Pick<Cycle, 'startDate' | 'endDate' | 'overhead'>,
  cyclePerson?: Pick<CyclePerson, 'cycleCapacity'>,
): number {
  if (quarter) {
    return getCyclePersonCapacitySummary(quarter as Cycle, person, cyclePerson as Pick<CyclePerson, 'cycleCapacity' | 'overheadOverride'> | undefined).effectiveCapacity;
  }
  return Math.max(0, Math.min(100, Math.round(cyclePerson?.cycleCapacity ?? person.defaultCapacity)));
}

function getActiveCapacityAllocations(
  allocations: Allocation[],
  filters: {
    personId?: string;
    projectId?: string;
    cycleId?: string | null;
  } = {},
): Allocation[] {
  return allocations.filter((allocation) => {
    if (!isActiveAllocation(allocation)) return false;
    if (!personTracksCapacity(allocation.role)) return false;
    if (!allocation.projectId) return false;
    if (filters.personId !== undefined && allocation.personId !== filters.personId) return false;
    if (filters.projectId !== undefined && allocation.projectId !== filters.projectId) return false;
    if (filters.cycleId !== undefined && allocation.cycleId !== filters.cycleId) return false;
    return true;
  });
}

function getExplicitProjectPercentages(allocations: Allocation[]): Map<string, number> {
  const projectPercentages = new Map<string, number[]>();

  for (const allocation of allocations) {
    if (!allocation.projectId) continue;
    const percentages = projectPercentages.get(allocation.projectId) ?? [];
    percentages.push(allocation.percentage);
    projectPercentages.set(allocation.projectId, percentages);
  }

  return new Map(
    [...projectPercentages.entries()].map(([projectId, percentages]) => [
      projectId,
      Math.round(percentages.reduce((sum, percentage) => sum + percentage, 0) / percentages.length),
    ]),
  );
}

export function getPersonProjectCapacityShares(params: {
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>;
  quarter?: Pick<Cycle, 'startDate' | 'endDate' | 'overhead'>;
  cyclePerson?: Pick<CyclePerson, 'cycleCapacity'>;
  cycleId?: string | null;
  assignedProjectIds?: string[];
  allocations: Allocation[];
}): PersonProjectCapacityShare[] {
  const { person, quarter, cyclePerson, cycleId, assignedProjectIds = [], allocations } = params;
  if (!personTracksCapacity(person.role)) return [];

  const activeAllocations = getActiveCapacityAllocations(allocations, { personId: person.id, cycleId });
  const explicitByProject = getExplicitProjectPercentages(activeAllocations);
  const capacityLimit = getPersonCapacityLimit(person, quarter, cyclePerson);
  const projectIds = uniqueProjectIds([
    ...assignedProjectIds,
    ...activeAllocations.map((allocation) => allocation.projectId),
  ]);

  return projectIds.map((projectId) => ({
    projectId,
    percentage: Math.max(0, Math.min(capacityLimit, explicitByProject.get(projectId) ?? 0)),
    isEvenSplit: false,
  }));
}

export function getPersonProjectCapacityShare(params: {
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>;
  projectId: string;
  quarter?: Pick<Cycle, 'startDate' | 'endDate' | 'overhead'>;
  cyclePerson?: Pick<CyclePerson, 'cycleCapacity'>;
  cycleId?: string | null;
  allocations: Allocation[];
}): PersonProjectCapacityShare {
  const { person, projectId, quarter, cyclePerson, cycleId, allocations } = params;
  if (!personTracksCapacity(person.role)) {
    return { projectId, percentage: 0, isEvenSplit: false };
  }

  const shares = getPersonProjectCapacityShares({
    person,
    quarter,
    cyclePerson,
    cycleId,
    assignedProjectIds: [projectId],
    allocations,
  });

  return shares.find((entry) => entry.projectId === projectId) ?? { projectId, percentage: 0, isEvenSplit: false };
}

export function getPersonExplicitAllocatedPct(params: {
  personId: string;
  cycleId?: string | null;
  projectIdToExclude?: string;
  allocations: Allocation[];
}): number {
  const { personId, cycleId, projectIdToExclude, allocations } = params;
  return getActiveCapacityAllocations(allocations, { personId, cycleId })
    .filter((allocation) => allocation.projectId !== projectIdToExclude)
    .reduce((sum, allocation) => sum + allocation.percentage, 0);
}

export function getPersonRemainingAllocationPct(params: {
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>;
  quarter?: Pick<Cycle, 'startDate' | 'endDate' | 'overhead'>;
  cyclePerson?: Pick<CyclePerson, 'cycleCapacity'>;
  cycleId?: string | null;
  allocations: Allocation[];
}): number {
  const { person, quarter, cyclePerson, cycleId, allocations } = params;
  if (!personTracksCapacity(person.role)) return 0;

  const capacityLimit = getPersonCapacityLimit(person, quarter, cyclePerson);
  const explicitAllocatedPct = getPersonExplicitAllocatedPct({
    personId: person.id,
    cycleId,
    allocations,
  });
  return Math.max(0, capacityLimit - explicitAllocatedPct);
}

export function getMaxProjectAllocationPercentage(params: {
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>;
  projectId: string;
  quarter?: Pick<Cycle, 'startDate' | 'endDate' | 'overhead'>;
  cyclePerson?: Pick<CyclePerson, 'cycleCapacity'>;
  cycleId?: string | null;
  allocations: Allocation[];
}): number {
  const { person, projectId, quarter, cyclePerson, cycleId, allocations } = params;
  if (!personTracksCapacity(person.role)) return 0;

  const capacityLimit = getPersonCapacityLimit(person, quarter, cyclePerson);
  const otherAllocatedPct = getPersonExplicitAllocatedPct({
    personId: person.id,
    cycleId,
    projectIdToExclude: projectId,
    allocations,
  });
  return Math.max(0, capacityLimit - otherAllocatedPct);
}

export function clampProjectAllocationPercentage(params: {
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>;
  projectId: string;
  quarter?: Pick<Cycle, 'startDate' | 'endDate' | 'overhead'>;
  cyclePerson?: Pick<CyclePerson, 'cycleCapacity'>;
  cycleId?: string | null;
  allocations: Allocation[];
  requestedPercentage: number;
}): number {
  const { requestedPercentage, ...rest } = params;
  const maxAllowed = getMaxProjectAllocationPercentage(rest);
  return Math.max(0, Math.min(maxAllowed, Math.round(requestedPercentage)));
}

export function getCyclePersonAvailableWeeks(
  quarter: Cycle,
  person: Pick<Person, 'defaultCapacity'>,
  cyclePerson?: Pick<CyclePerson, 'cycleCapacity' | 'overheadOverride'>,
): number {
  const quarterDurationWeeks = getCycleDurationWeeks(quarter.startDate, quarter.endDate);
  const baseCapacity = cyclePerson?.cycleCapacity ?? person.defaultCapacity;
  const overhead = resolveOverhead(quarter.overhead, cyclePerson?.overheadOverride ?? null);
  const effectiveCapacity = computeEffectiveCapacity(baseCapacity, overhead, quarterDurationWeeks);
  return Number(((quarterDurationWeeks * effectiveCapacity) / 100).toFixed(1));
}

export function getCyclePersonCapacitySummary(
  quarter: Cycle,
  person: Pick<Person, 'defaultCapacity'>,
  cyclePerson?: Pick<CyclePerson, 'cycleCapacity' | 'overheadOverride'>,
): CyclePersonCapacitySummary {
  const quarterDurationWeeks = getCycleDurationWeeks(quarter.startDate, quarter.endDate);
  const baseCapacity = cyclePerson?.cycleCapacity ?? person.defaultCapacity;
  const overhead = resolveOverhead(quarter.overhead, cyclePerson?.overheadOverride ?? null);
  const effectiveCapacity = computeEffectiveCapacity(baseCapacity, overhead, quarterDurationWeeks);
  return {
    baseCapacity,
    effectiveCapacity,
    availableWeeks: Number(((quarterDurationWeeks * effectiveCapacity) / 100).toFixed(1)),
    usesOverride: cyclePerson?.overheadOverride !== null && cyclePerson?.overheadOverride !== undefined,
    overhead,
  };
}

function getEffectiveCapacityLimit(
  quarter: Cycle,
  person: Pick<Person, 'defaultCapacity'>,
  cyclePerson?: Pick<CyclePerson, 'cycleCapacity' | 'overheadOverride'>,
): number {
  return getCyclePersonCapacitySummary(quarter, person, cyclePerson).effectiveCapacity;
}

export function getCyclePersonProjectSummary(
  quarter: Cycle,
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>,
  cyclePerson: Pick<CyclePerson, 'cycleId' | 'cycleCapacity' | 'overheadOverride'> | undefined,
  allocations: Allocation[],
): CyclePersonProjectSummary {
  const availableWeeks = getCyclePersonAvailableWeeks(quarter, person, cyclePerson);
  const tracksCapacity = personTracksCapacity(person.role);
  const capacityLimit = getPersonCapacityLimit(person, quarter, cyclePerson);

  if (!tracksCapacity) {
    return {
      tracksCapacity,
      availableWeeks,
      capacityLimit,
      totalAllocatedPct: 0,
      effectiveCapacity: 0,
      allocatedWeeks: 0,
      remainingWeeks: availableWeeks,
      remainingPct: capacityLimit,
      overAllocated: false,
    };
  }

  const shares = getPersonProjectCapacityShares({
    person,
    quarter,
    cyclePerson,
    cycleId: quarter.id,
    allocations,
  });
  const totalAllocatedPct = shares.reduce((sum, share) => sum + share.percentage, 0);
  const effectiveCapacity = capacityLimit;
  const allocationUsageRatio = effectiveCapacity > 0 ? totalAllocatedPct / effectiveCapacity : 0;
  const allocatedWeeks = Number((availableWeeks * allocationUsageRatio).toFixed(1));
  const remainingWeeks = Number((availableWeeks - allocatedWeeks).toFixed(1));

  return {
    tracksCapacity,
    availableWeeks,
    capacityLimit,
    totalAllocatedPct,
    effectiveCapacity,
    allocatedWeeks,
    remainingWeeks,
    remainingPct: Math.max(0, capacityLimit - totalAllocatedPct),
    overAllocated: totalAllocatedPct > capacityLimit,
  };
}

export function getCycleCapacitySummary(
  quarter: Cycle,
  people: Person[],
  cyclePeople: CyclePerson[],
): CycleCapacitySummary {
  const totalAvailablePersonWeeks = Number(people.reduce((sum, person) => {
    if (!personTracksCapacity(person.role)) return sum;
    const cyclePerson = cyclePeople.find((candidate) => candidate.personId === person.id && candidate.cycleId === quarter.id);
    return sum + getCyclePersonAvailableWeeks(quarter, person, cyclePerson);
  }, 0).toFixed(1));

  const quarterDurationWeeks = getCycleDurationWeeks(quarter.startDate, quarter.endDate);
  return {
    totalAvailablePersonWeeks,
    totalAvailableWeeklyPeople: quarterDurationWeeks > 0 ? Number((totalAvailablePersonWeeks / quarterDurationWeeks).toFixed(2)) : 0,
  };
}

export function getProjectCapacitySummary(params: {
  projectId: string;
  quarter: Cycle;
  estimatedPersonWeeks: number | null;
  people: Person[];
  cyclePeople: CyclePerson[];
  activeAllocations: Allocation[];
}): ProjectCapacitySummary {
  const { projectId, quarter, estimatedPersonWeeks, people, cyclePeople, activeAllocations } = params;
  const currentAllocations = getActiveCapacityAllocations(activeAllocations, { cycleId: quarter.id, projectId });
  const assignedPeople = people.filter((person) => currentAllocations.some((allocation) => allocation.personId === person.id));

  const reservedPersonWeeks = Number(assignedPeople.reduce((sum, person) => {
    const cyclePerson = cyclePeople.find((candidate) => candidate.personId === person.id && candidate.cycleId === quarter.id);
    const availableWeeks = getCyclePersonAvailableWeeks(quarter, person, cyclePerson);
    const effectiveCapacity = getPersonCapacityLimit(person, quarter, cyclePerson);
    const share = getPersonProjectCapacityShare({
      person,
      projectId,
      quarter,
      cyclePerson,
      cycleId: quarter.id,
      allocations: activeAllocations,
    });
    const projectUsageRatio = effectiveCapacity > 0 ? share.percentage / effectiveCapacity : 0;
    return sum + (availableWeeks * projectUsageRatio);
  }, 0).toFixed(1));

  const quarterDurationWeeks = getCycleDurationWeeks(quarter.startDate, quarter.endDate);
  const reservedWeeklyPeople = quarterDurationWeeks > 0 ? Number((reservedPersonWeeks / quarterDurationWeeks).toFixed(2)) : 0;

  return {
    estimatedPersonWeeks,
    reservedPersonWeeks,
    reservedWeeklyPeople,
    remainingPersonWeeks: estimatedPersonWeeks === null ? null : Number((estimatedPersonWeeks - reservedPersonWeeks).toFixed(1)),
  };
}

export function getAssignableEngineers(
  people: Person[],
  cyclePeople: CyclePerson[],
  quarter: Cycle,
  activeAllocations: Allocation[],
): Person[] {
  return people.filter((person) => {
    if (!personTracksCapacity(person.role)) return false;
    const cyclePerson = cyclePeople.find((entry) => entry.personId === person.id && entry.cycleId === quarter.id);
    if (!cyclePerson || cyclePerson.inactive) return false;
    const availableWeeks = getCyclePersonAvailableWeeks(quarter, person, cyclePerson);
    if (availableWeeks <= 0) return false;
    return getPersonRemainingAllocationPct({
      person,
      quarter,
      cyclePerson,
      cycleId: quarter.id,
      allocations: activeAllocations,
    }) > 0;
  });
}
