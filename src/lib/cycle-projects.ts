import { planSyncProjectToSubteamRoster } from './projects';
import type { Allocation, Person, Project, Cycle, CyclePerson, CycleProject, Role } from './types';

export interface AddProjectToCycleContext {
  quarter: Cycle;
  cycleProjects: CycleProject[];
  cyclePeople: CyclePerson[];
  projects: Project[];
  people: Person[];
  allAllocations: Allocation[];
}

export interface AddProjectToCyclePlan {
  cycleProjectToCreate: CycleProject;
  cyclePeopleToCreate: CyclePerson[];
  allocationsToCreate: Allocation[];
}

function projectRoleCreatesActiveCycleEntry(roleType: Role): boolean {
  return roleType === 'DRI' || roleType === 'EM' || roleType === 'PM' || roleType === 'Stakeholder' || roleType === 'Engineer';
}

function createCycleProjectRecord(
  quarter: Cycle,
  cycleProjectCount: number,
  project: Project,
  createId: () => string,
): CycleProject {
  return {
    id: createId(),
    cycleId: quarter.id,
    projectId: project.id,
    status: project.status,
    priority: cycleProjectCount,
    estimatedPersonWeeks: null,
    notes: '',
    plannedStartWeek: null,
    plannedEndWeek: null,
    targetMilestone: null,
  };
}

export function planAddProjectToCycle(
  context: AddProjectToCycleContext,
  projectId: string,
  createId: () => string,
): AddProjectToCyclePlan | null {
  const { quarter, cycleProjects, cyclePeople, projects, people, allAllocations } = context;
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) return null;

  const templateAllocations = allAllocations.filter((allocation) => allocation.projectId === projectId && allocation.cycleId === '');
  const derivedSubteamAllocations = templateAllocations.length === 0
    ? planSyncProjectToSubteamRoster({
      allocations: allAllocations.filter((allocation) => allocation.cycleId === quarter.id),
      createId,
      project,
      projects,
      quarter,
      today: quarter.startDate,
    })
    : [];
  const sourceAllocations = templateAllocations.length > 0 ? templateAllocations : derivedSubteamAllocations;
  const cyclePersonIds = new Set(cyclePeople.map((entry) => entry.personId));
  const cyclePeopleToCreate = sourceAllocations
    .filter((allocation) => !cyclePersonIds.has(allocation.personId))
    .map((allocation) => {
      const person = people.find((candidate) => candidate.id === allocation.personId);
      if (!person) return null;
      cyclePersonIds.add(allocation.personId);
      return {
        id: createId(),
        cycleId: quarter.id,
        personId: allocation.personId,
        subteamId: project.subteamId,
        inactive: false,
        cycleCapacity: person.defaultCapacity,
        overheadOverride: null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const allocationsToCreate = sourceAllocations.map((allocation) => ({
    ...allocation,
    id: createId(),
    cycleId: quarter.id,
    startDate: quarter.startDate,
    endDate: null,
  }));

  return {
    cycleProjectToCreate: createCycleProjectRecord(quarter, cycleProjects.length, project, createId),
    cyclePeopleToCreate,
    allocationsToCreate,
  };
}
