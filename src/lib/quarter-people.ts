import { getQuarterPersonAvailableWeeks } from './quarter-capacity';
import { getPersonProjectCapacityShares, personNeedsProjectCapacity } from './project-team';
import type { Allocation, Person, ProjectRole, Quarter, QuarterPerson } from './types';

export interface QuarterPeopleLists {
  inQuarter: Person[];
  sortedInQuarter: Person[];
  notInQuarter: Person[];
  filteredNotInQuarter: Person[];
  quarterPersonByPersonId: Map<string, QuarterPerson>;
}

export interface QuarterPersonProjectSummary {
  tracksCapacity: boolean;
  availableWeeks: number;
  totalAllocatedPct: number;
  allocatedWeeks: number;
  remainingWeeks: number;
  overAllocated: boolean;
}

export function getQuarterPeopleLists(
  people: Person[],
  quarterPeople: QuarterPerson[],
  search: string,
): QuarterPeopleLists {
  const quarterPersonByPersonId = new Map(quarterPeople.map((quarterPerson) => [quarterPerson.personId, quarterPerson]));
  const inQuarter = people.filter((person) => quarterPersonByPersonId.has(person.id));
  const notInQuarter = people.filter(
    (person) => !quarterPersonByPersonId.has(person.id) && personNeedsProjectCapacity(person.role),
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredNotInQuarter = normalizedSearch
    ? notInQuarter.filter((person) => person.name.toLowerCase().includes(normalizedSearch))
    : notInQuarter;
  const sortedInQuarter = [...inQuarter]
    .filter((person) => personNeedsProjectCapacity(person.role))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    inQuarter,
    sortedInQuarter,
    notInQuarter,
    filteredNotInQuarter,
    quarterPersonByPersonId,
  };
}

export function getQuarterPersonProjectSummary(
  quarter: Quarter,
  person: Person,
  quarterPerson: QuarterPerson | undefined,
  projectRoles: ProjectRole[],
  allocations: Allocation[],
): QuarterPersonProjectSummary {
  const availableWeeks = getQuarterPersonAvailableWeeks(quarter, person, quarterPerson);
  const tracksCapacity = personNeedsProjectCapacity(person.role);
  if (!tracksCapacity) {
    return {
      tracksCapacity,
      availableWeeks,
      totalAllocatedPct: 0,
      allocatedWeeks: 0,
      remainingWeeks: availableWeeks,
      overAllocated: false,
    };
  }

  const assignedProjectIds = projectRoles
    .filter((role) => role.personId === person.id)
    .map((role) => role.projectId);
  const personAllocations = allocations.filter((allocation) => allocation.personId === person.id);
  const shares = getPersonProjectCapacityShares(
    person.id,
    person.defaultCapacity,
    assignedProjectIds,
    projectRoles,
    personAllocations,
  );
  const totalAllocatedPct = shares.reduce((sum, share) => sum + share.percentage, 0);
  const allocatedWeeks = Number(((availableWeeks * totalAllocatedPct) / 100).toFixed(1));
  const remainingWeeks = Number((availableWeeks - allocatedWeeks).toFixed(1));

  return {
    tracksCapacity,
    availableWeeks,
    totalAllocatedPct,
    allocatedWeeks,
    remainingWeeks,
    overAllocated: remainingWeeks < 0,
  };
}
