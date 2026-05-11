import { getProjectCapacitySummary, type ProjectCapacitySummary } from './quarter-capacity';
import { getPersonProjectCapacityShares } from './project-team';
import type { Allocation, Person, ProjectRole, ProjectRoleType, Quarter, QuarterPerson, QuarterProject } from './types';

const PROJECT_ROLE_ORDER: ProjectRoleType[] = ['DRI', 'EM', 'PM', 'Engineer'];

export interface ProjectQuarterCapacitySummary {
  quarter: Quarter;
  quarterProject: QuarterProject | null;
  summary: ProjectCapacitySummary;
}

export function getActiveProjectRoles(
  projectId: string,
  activeQuarterId: string | null,
  allProjectRoles: ProjectRole[],
): {
  activeProjectRoles: ProjectRole[];
  projectRoles: ProjectRole[];
} {
  const activeProjectRoles = activeQuarterId
    ? allProjectRoles.filter((role) => role.quarterId === activeQuarterId)
    : allProjectRoles.filter((role) => role.quarterId === '');

  return {
    activeProjectRoles,
    projectRoles: activeProjectRoles.filter((role) => role.projectId === projectId),
  };
}

export function getActiveProjectAllocations(
  activeQuarterId: string | null,
  allocations: Allocation[],
): Allocation[] {
  return activeQuarterId
    ? allocations.filter((allocation) => allocation.quarterId === activeQuarterId)
    : allocations.filter((allocation) => allocation.quarterId === '');
}

export function getAssignedProjectQuarters(
  allQuarters: Quarter[],
  allQuarterProjects: QuarterProject[],
): Quarter[] {
  const projectQuarterIds = new Set(allQuarterProjects.map((quarterProject) => quarterProject.quarterId));
  return allQuarters.filter((quarter) => projectQuarterIds.has(quarter.id));
}

export function buildProjectQuarterCapacitySummaries(params: {
  projectId: string;
  assignedQuarters: Quarter[];
  allQuarterProjects: QuarterProject[];
  allProjectRoles: ProjectRole[];
  allocations: Allocation[];
  people: Person[];
  quarterPeople: QuarterPerson[];
}): ProjectQuarterCapacitySummary[] {
  const {
    projectId,
    assignedQuarters,
    allQuarterProjects,
    allProjectRoles,
    allocations,
    people,
    quarterPeople,
  } = params;

  return assignedQuarters.map((quarter) => {
    const quarterProject = allQuarterProjects.find((candidate) => candidate.quarterId === quarter.id) ?? null;
    const quarterProjectRoles = allProjectRoles.filter((role) => role.quarterId === quarter.id);
    const quarterAllocations = allocations.filter((allocation) => allocation.quarterId === quarter.id);
    const summary = getProjectCapacitySummary({
      projectId,
      quarter,
      estimatedPersonWeeks: quarterProject?.estimatedPersonWeeks ?? null,
      people,
      quarterPeople,
      activeProjectRoles: quarterProjectRoles,
      activeAllocations: quarterAllocations,
    });
    return { quarter, quarterProject, summary };
  });
}

export function sortProjectRoles(projectRoles: ProjectRole[]): ProjectRole[] {
  return [...projectRoles].sort((a, b) => {
    const leftIndex = PROJECT_ROLE_ORDER.indexOf(a.role);
    const rightIndex = PROJECT_ROLE_ORDER.indexOf(b.role);
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
}

export function getRemainingProjectPersonCapacity(
  personId: string,
  people: Person[],
  activeProjectRoles: ProjectRole[],
  activeAllocations: Allocation[],
): number {
  const person = people.find((candidate) => candidate.id === personId);
  if (!person) return 100;

  const assignedProjectIds = activeProjectRoles
    .filter((role) => role.personId === personId)
    .map((role) => role.projectId);
  if (assignedProjectIds.length === 0) return person.defaultCapacity;

  const personAllocations = activeAllocations.filter((allocation) => allocation.personId === personId);
  const shares = getPersonProjectCapacityShares(
    personId,
    person.defaultCapacity,
    assignedProjectIds,
    activeProjectRoles,
    personAllocations,
  );
  const totalAllocated = shares.reduce((sum, share) => sum + share.percentage, 0);
  return Math.max(0, person.defaultCapacity - totalAllocated);
}
