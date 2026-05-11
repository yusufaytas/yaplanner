import { planSyncProjectToSubteamRoster } from './projects';
import type { Allocation, Person, Project, Quarter, QuarterPerson, QuarterProject, Role } from './types';

export interface AddProjectToQuarterContext {
  quarter: Quarter;
  quarterProjects: QuarterProject[];
  quarterPeople: QuarterPerson[];
  projects: Project[];
  people: Person[];
  allAllocations: Allocation[];
}

export interface AddProjectToQuarterPlan {
  quarterProjectToCreate: QuarterProject;
  quarterPeopleToCreate: QuarterPerson[];
  allocationsToCreate: Allocation[];
}

function projectRoleCreatesActiveQuarterEntry(roleType: Role): boolean {
  return roleType === 'DRI' || roleType === 'EM' || roleType === 'PM' || roleType === 'Stakeholder' || roleType === 'Engineer';
}

function createQuarterProjectRecord(
  quarter: Quarter,
  quarterProjectCount: number,
  project: Project,
  createId: () => string,
): QuarterProject {
  return {
    id: createId(),
    quarterId: quarter.id,
    projectId: project.id,
    status: project.status,
    priority: quarterProjectCount,
    estimatedPersonWeeks: null,
    notes: '',
    plannedStartWeek: null,
    plannedEndWeek: null,
    targetMilestone: null,
  };
}

export function planAddProjectToQuarter(
  context: AddProjectToQuarterContext,
  projectId: string,
  createId: () => string,
): AddProjectToQuarterPlan | null {
  const { quarter, quarterProjects, quarterPeople, projects, people, allAllocations } = context;
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) return null;

  const templateAllocations = allAllocations.filter((allocation) => allocation.projectId === projectId && allocation.quarterId === '');
  const derivedSubteamAllocations = templateAllocations.length === 0
    ? planSyncProjectToSubteamRoster({
      allocations: allAllocations.filter((allocation) => allocation.quarterId === quarter.id),
      createId,
      project,
      projects,
      quarter,
      today: quarter.startDate,
    })
    : [];
  const sourceAllocations = templateAllocations.length > 0 ? templateAllocations : derivedSubteamAllocations;
  const quarterPersonIds = new Set(quarterPeople.map((entry) => entry.personId));
  const quarterPeopleToCreate = sourceAllocations
    .filter((allocation) => !quarterPersonIds.has(allocation.personId))
    .map((allocation) => {
      const person = people.find((candidate) => candidate.id === allocation.personId);
      if (!person) return null;
      quarterPersonIds.add(allocation.personId);
      return {
        id: createId(),
        quarterId: quarter.id,
        personId: allocation.personId,
        subteamId: project.subteamId,
        inactive: false,
        quarterCapacity: person.defaultCapacity,
        overheadOverride: null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const allocationsToCreate = sourceAllocations.map((allocation) => ({
    ...allocation,
    id: createId(),
    quarterId: quarter.id,
    startDate: quarter.startDate,
    endDate: null,
  }));

  return {
    quarterProjectToCreate: createQuarterProjectRecord(quarter, quarterProjects.length, project, createId),
    quarterPeopleToCreate,
    allocationsToCreate,
  };
}
