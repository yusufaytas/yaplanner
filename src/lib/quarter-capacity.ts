import {
  computeEffectiveCapacity,
  resolveOverhead,
  type CapacityOverhead,
  type Allocation,
  type Person,
  type ProjectRole,
  type Quarter,
  type QuarterPerson,
} from './types';
import { getPersonProjectCapacityShare, getPersonProjectCapacityShares, personNeedsProjectCapacity } from './project-team';
import { getQuarterWeeks } from './weeks';
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

export function getQuarterPersonAvailableWeeks(
  quarter: Quarter,
  person: Pick<Person, 'defaultCapacity'>,
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity' | 'overheadOverride'>,
): number {
  const quarterWeeks = getQuarterWeeks(quarter.startDate, quarter.endDate);
  const baseCapacity = quarterPerson?.quarterCapacity ?? person.defaultCapacity;
  const overhead = resolveOverhead(quarter.overhead, quarterPerson?.overheadOverride ?? null);
  const effectiveCapacity = computeEffectiveCapacity(baseCapacity, overhead, quarterWeeks.length);
  return Number(((quarterWeeks.length * effectiveCapacity) / 100).toFixed(1));
}

export function getQuarterPersonCapacitySummary(
  quarter: Quarter,
  person: Pick<Person, 'defaultCapacity'>,
  quarterPerson?: Pick<QuarterPerson, 'quarterCapacity' | 'overheadOverride'>,
): QuarterPersonCapacitySummary {
  const quarterWeeks = getQuarterWeeks(quarter.startDate, quarter.endDate);
  const baseCapacity = quarterPerson?.quarterCapacity ?? person.defaultCapacity;
  const overhead = resolveOverhead(quarter.overhead, quarterPerson?.overheadOverride ?? null);
  const effectiveCapacity = computeEffectiveCapacity(baseCapacity, overhead, quarterWeeks.length);
  return {
    baseCapacity,
    effectiveCapacity,
    availableWeeks: Number(((quarterWeeks.length * effectiveCapacity) / 100).toFixed(1)),
    usesOverride: quarterPerson?.overheadOverride !== null && quarterPerson?.overheadOverride !== undefined,
    overhead,
  };
}

export function getQuarterCapacitySummary(
  quarter: Quarter,
  people: Person[],
  quarterPeople: QuarterPerson[],
): QuarterCapacitySummary {
  const engineerPeople = people.filter((person) => person.role === 'Engineer');
  const totalAvailablePersonWeeks = Number(engineerPeople.reduce((sum, person) => {
    const quarterPerson = quarterPeople.find(
      (candidate) => candidate.personId === person.id && candidate.quarterId === quarter.id,
    );
    return sum + getQuarterPersonAvailableWeeks(quarter, person, quarterPerson);
  }, 0).toFixed(1));

  const quarterWeeks = getQuarterWeeks(quarter.startDate, quarter.endDate);
  return {
    totalAvailablePersonWeeks,
    totalAvailableWeeklyPeople: quarterWeeks.length > 0
      ? Number((totalAvailablePersonWeeks / quarterWeeks.length).toFixed(2))
      : 0,
  };
}

export function getProjectCapacitySummary(params: {
  projectId: string;
  quarter: Quarter;
  estimatedPersonWeeks: number | null;
  people: Person[];
  quarterPeople: QuarterPerson[];
  activeProjectRoles: ProjectRole[];
  activeAllocations: Allocation[];
}): ProjectCapacitySummary {
  const {
    projectId,
    quarter,
    estimatedPersonWeeks,
    people,
    quarterPeople,
    activeProjectRoles,
    activeAllocations,
  } = params;

  const assignedPeople = people.filter((person) =>
    activeProjectRoles.some((projectRole) => projectRole.projectId === projectId && projectRole.personId === person.id),
  );

  const reservedPersonWeeks = Number(assignedPeople.reduce((sum, person) => {
    if (!personNeedsProjectCapacity(person.role)) return sum;
    const quarterPerson = quarterPeople.find((candidate) => candidate.personId === person.id && candidate.quarterId === quarter.id);
    const availableWeeks = getQuarterPersonAvailableWeeks(quarter, person, quarterPerson);
    const share = getPersonProjectCapacityShare(person, projectId, activeProjectRoles, activeAllocations);
    return sum + ((availableWeeks * share.percentage) / 100);
  }, 0).toFixed(1));

  const quarterWeeks = getQuarterWeeks(quarter.startDate, quarter.endDate);
  const reservedWeeklyPeople = quarterWeeks.length > 0
    ? Number((reservedPersonWeeks / quarterWeeks.length).toFixed(2))
    : 0;

  return {
    estimatedPersonWeeks,
    reservedPersonWeeks,
    reservedWeeklyPeople,
    remainingPersonWeeks: estimatedPersonWeeks === null
      ? null
      : Number((estimatedPersonWeeks - reservedPersonWeeks).toFixed(1)),
  };
}

/**
 * Returns engineers who are eligible to be assigned to a project in a given quarter.
 * An engineer is eligible if:
 *   - They have a QuarterPerson record for the quarter (they've been added to it)
 *   - They are not marked inactive
 *   - Their remaining capacity (available weeks minus already-allocated share) is > 0
 */
export function getAssignableEngineers(
  people: Person[],
  quarterPeople: QuarterPerson[],
  quarter: Quarter,
  activeProjectRoles: ProjectRole[],
  activeAllocations: Allocation[],
): Person[] {
  return people.filter((person) => {
    if (!personNeedsProjectCapacity(person.role)) return false;
    const qp = quarterPeople.find(
      (q) => q.personId === person.id && q.quarterId === quarter.id,
    );
    if (!qp || qp.inactive) return false;
    const availableWeeks = getQuarterPersonAvailableWeeks(quarter, person, qp);
    if (availableWeeks <= 0) return false;

    // Sum up already-allocated share across all projects
    const assignedProjectIds = activeProjectRoles
      .filter((r) => r.personId === person.id)
      .map((r) => r.projectId);
    const personAllocations = activeAllocations.filter((a) => a.personId === person.id);
    const shares = getPersonProjectCapacityShares(
      person.id,
      person.defaultCapacity,
      assignedProjectIds,
      activeProjectRoles,
      personAllocations,
    );
    const totalAllocatedPct = shares.reduce((sum, s) => sum + s.percentage, 0);
    return totalAllocatedPct < person.defaultCapacity;
  });
}
