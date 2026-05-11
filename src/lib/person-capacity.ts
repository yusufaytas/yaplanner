import {
  computeEffectiveCapacity,
  resolveOverhead,
  type Allocation,
  type CapacityOverhead,
  type Person,
  type Quarter,
  type QuarterPerson,
  type Role,
} from './types';
import { getQuarterDurationWeeks } from './weeks';

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

export interface QuarterCapacitySummary {
  totalAvailablePersonWeeks: number;
  totalAvailableWeeklyPeople: number;
}

export interface QuarterPersonCapacitySummary {
  baseCapacity: number;
  effectiveCapacity: number;
  availableWeeks: number;
  usesOverride: boolean;
  overhead: CapacityOverhead;
}

export interface QuarterPersonProjectSummary {
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
  quarter?: Pick<Quarter, 'startDate' | 'endDate' | 'overhead'>,
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity'>,
): number {
  if (quarter) {
    return getQuarterPersonCapacitySummary(quarter as Quarter, person, quarterPerson as Pick<QuarterPerson, 'quarterCapacity' | 'overheadOverride'> | undefined).effectiveCapacity;
  }
  return Math.max(0, Math.min(100, Math.round(quarterPerson?.quarterCapacity ?? person.defaultCapacity)));
}

function getActiveCapacityAllocations(
  allocations: Allocation[],
  filters: {
    personId?: string;
    projectId?: string;
    quarterId?: string | null;
  } = {},
): Allocation[] {
  return allocations.filter((allocation) => {
    if (!isActiveAllocation(allocation)) return false;
    if (!personTracksCapacity(allocation.role)) return false;
    if (!allocation.projectId) return false;
    if (filters.personId !== undefined && allocation.personId !== filters.personId) return false;
    if (filters.projectId !== undefined && allocation.projectId !== filters.projectId) return false;
    if (filters.quarterId !== undefined && allocation.quarterId !== filters.quarterId) return false;
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
  quarter?: Pick<Quarter, 'startDate' | 'endDate' | 'overhead'>;
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity'>;
  quarterId?: string | null;
  assignedProjectIds?: string[];
  allocations: Allocation[];
}): PersonProjectCapacityShare[] {
  const { person, quarter, quarterPerson, quarterId, assignedProjectIds = [], allocations } = params;
  if (!personTracksCapacity(person.role)) return [];

  const activeAllocations = getActiveCapacityAllocations(allocations, { personId: person.id, quarterId });
  const explicitByProject = getExplicitProjectPercentages(activeAllocations);
  const capacityLimit = getPersonCapacityLimit(person, quarter, quarterPerson);
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
  quarter?: Pick<Quarter, 'startDate' | 'endDate' | 'overhead'>;
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity'>;
  quarterId?: string | null;
  allocations: Allocation[];
}): PersonProjectCapacityShare {
  const { person, projectId, quarter, quarterPerson, quarterId, allocations } = params;
  if (!personTracksCapacity(person.role)) {
    return { projectId, percentage: 0, isEvenSplit: false };
  }

  const shares = getPersonProjectCapacityShares({
    person,
    quarter,
    quarterPerson,
    quarterId,
    assignedProjectIds: [projectId],
    allocations,
  });

  return shares.find((entry) => entry.projectId === projectId) ?? { projectId, percentage: 0, isEvenSplit: false };
}

export function getPersonExplicitAllocatedPct(params: {
  personId: string;
  quarterId?: string | null;
  projectIdToExclude?: string;
  allocations: Allocation[];
}): number {
  const { personId, quarterId, projectIdToExclude, allocations } = params;
  return getActiveCapacityAllocations(allocations, { personId, quarterId })
    .filter((allocation) => allocation.projectId !== projectIdToExclude)
    .reduce((sum, allocation) => sum + allocation.percentage, 0);
}

export function getPersonRemainingAllocationPct(params: {
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>;
  quarter?: Pick<Quarter, 'startDate' | 'endDate' | 'overhead'>;
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity'>;
  quarterId?: string | null;
  allocations: Allocation[];
}): number {
  const { person, quarter, quarterPerson, quarterId, allocations } = params;
  if (!personTracksCapacity(person.role)) return 0;

  const capacityLimit = getPersonCapacityLimit(person, quarter, quarterPerson);
  const explicitAllocatedPct = getPersonExplicitAllocatedPct({
    personId: person.id,
    quarterId,
    allocations,
  });
  return Math.max(0, capacityLimit - explicitAllocatedPct);
}

export function getMaxProjectAllocationPercentage(params: {
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>;
  projectId: string;
  quarter?: Pick<Quarter, 'startDate' | 'endDate' | 'overhead'>;
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity'>;
  quarterId?: string | null;
  allocations: Allocation[];
}): number {
  const { person, projectId, quarter, quarterPerson, quarterId, allocations } = params;
  if (!personTracksCapacity(person.role)) return 0;

  const capacityLimit = getPersonCapacityLimit(person, quarter, quarterPerson);
  const otherAllocatedPct = getPersonExplicitAllocatedPct({
    personId: person.id,
    quarterId,
    projectIdToExclude: projectId,
    allocations,
  });
  return Math.max(0, capacityLimit - otherAllocatedPct);
}

export function clampProjectAllocationPercentage(params: {
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>;
  projectId: string;
  quarter?: Pick<Quarter, 'startDate' | 'endDate' | 'overhead'>;
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity'>;
  quarterId?: string | null;
  allocations: Allocation[];
  requestedPercentage: number;
}): number {
  const { requestedPercentage, ...rest } = params;
  const maxAllowed = getMaxProjectAllocationPercentage(rest);
  return Math.max(0, Math.min(maxAllowed, Math.round(requestedPercentage)));
}

export function getQuarterPersonAvailableWeeks(
  quarter: Quarter,
  person: Pick<Person, 'defaultCapacity'>,
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity' | 'overheadOverride'>,
): number {
  const quarterDurationWeeks = getQuarterDurationWeeks(quarter.startDate, quarter.endDate);
  const baseCapacity = quarterPerson?.quarterCapacity ?? person.defaultCapacity;
  const overhead = resolveOverhead(quarter.overhead, quarterPerson?.overheadOverride ?? null);
  const effectiveCapacity = computeEffectiveCapacity(baseCapacity, overhead, quarterDurationWeeks);
  return Number(((quarterDurationWeeks * effectiveCapacity) / 100).toFixed(1));
}

export function getQuarterPersonCapacitySummary(
  quarter: Quarter,
  person: Pick<Person, 'defaultCapacity'>,
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity' | 'overheadOverride'>,
): QuarterPersonCapacitySummary {
  const quarterDurationWeeks = getQuarterDurationWeeks(quarter.startDate, quarter.endDate);
  const baseCapacity = quarterPerson?.quarterCapacity ?? person.defaultCapacity;
  const overhead = resolveOverhead(quarter.overhead, quarterPerson?.overheadOverride ?? null);
  const effectiveCapacity = computeEffectiveCapacity(baseCapacity, overhead, quarterDurationWeeks);
  return {
    baseCapacity,
    effectiveCapacity,
    availableWeeks: Number(((quarterDurationWeeks * effectiveCapacity) / 100).toFixed(1)),
    usesOverride: quarterPerson?.overheadOverride !== null && quarterPerson?.overheadOverride !== undefined,
    overhead,
  };
}

function getEffectiveCapacityLimit(
  quarter: Quarter,
  person: Pick<Person, 'defaultCapacity'>,
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity' | 'overheadOverride'>,
): number {
  return getQuarterPersonCapacitySummary(quarter, person, quarterPerson).effectiveCapacity;
}

export function getQuarterPersonProjectSummary(
  quarter: Quarter,
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>,
  quarterPerson: Pick<QuarterPerson, 'quarterId' | 'quarterCapacity' | 'overheadOverride'> | undefined,
  allocations: Allocation[],
): QuarterPersonProjectSummary {
  const availableWeeks = getQuarterPersonAvailableWeeks(quarter, person, quarterPerson);
  const tracksCapacity = personTracksCapacity(person.role);
  const capacityLimit = getPersonCapacityLimit(person, quarter, quarterPerson);

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
    quarterPerson,
    quarterId: quarter.id,
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

export function getQuarterCapacitySummary(
  quarter: Quarter,
  people: Person[],
  quarterPeople: QuarterPerson[],
): QuarterCapacitySummary {
  const totalAvailablePersonWeeks = Number(people.reduce((sum, person) => {
    if (!personTracksCapacity(person.role)) return sum;
    const quarterPerson = quarterPeople.find((candidate) => candidate.personId === person.id && candidate.quarterId === quarter.id);
    return sum + getQuarterPersonAvailableWeeks(quarter, person, quarterPerson);
  }, 0).toFixed(1));

  const quarterDurationWeeks = getQuarterDurationWeeks(quarter.startDate, quarter.endDate);
  return {
    totalAvailablePersonWeeks,
    totalAvailableWeeklyPeople: quarterDurationWeeks > 0 ? Number((totalAvailablePersonWeeks / quarterDurationWeeks).toFixed(2)) : 0,
  };
}

export function getProjectCapacitySummary(params: {
  projectId: string;
  quarter: Quarter;
  estimatedPersonWeeks: number | null;
  people: Person[];
  quarterPeople: QuarterPerson[];
  activeAllocations: Allocation[];
}): ProjectCapacitySummary {
  const { projectId, quarter, estimatedPersonWeeks, people, quarterPeople, activeAllocations } = params;
  const currentAllocations = getActiveCapacityAllocations(activeAllocations, { quarterId: quarter.id, projectId });
  const assignedPeople = people.filter((person) => currentAllocations.some((allocation) => allocation.personId === person.id));

  const reservedPersonWeeks = Number(assignedPeople.reduce((sum, person) => {
    const quarterPerson = quarterPeople.find((candidate) => candidate.personId === person.id && candidate.quarterId === quarter.id);
    const availableWeeks = getQuarterPersonAvailableWeeks(quarter, person, quarterPerson);
    const effectiveCapacity = getPersonCapacityLimit(person, quarter, quarterPerson);
    const share = getPersonProjectCapacityShare({
      person,
      projectId,
      quarter,
      quarterPerson,
      quarterId: quarter.id,
      allocations: activeAllocations,
    });
    const projectUsageRatio = effectiveCapacity > 0 ? share.percentage / effectiveCapacity : 0;
    return sum + (availableWeeks * projectUsageRatio);
  }, 0).toFixed(1));

  const quarterDurationWeeks = getQuarterDurationWeeks(quarter.startDate, quarter.endDate);
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
  quarterPeople: QuarterPerson[],
  quarter: Quarter,
  activeAllocations: Allocation[],
): Person[] {
  return people.filter((person) => {
    if (!personTracksCapacity(person.role)) return false;
    const quarterPerson = quarterPeople.find((entry) => entry.personId === person.id && entry.quarterId === quarter.id);
    if (!quarterPerson || quarterPerson.inactive) return false;
    const availableWeeks = getQuarterPersonAvailableWeeks(quarter, person, quarterPerson);
    if (availableWeeks <= 0) return false;
    return getPersonRemainingAllocationPct({
      person,
      quarter,
      quarterPerson,
      quarterId: quarter.id,
      allocations: activeAllocations,
    }) > 0;
  });
}
