import { materializeTemplateAllocationsForQuarter, projectRoleNeedsCapacity, type ProjectCapacityAllocationPlan } from './project-team';
import type { Allocation, Person, Project, ProjectRole, ProjectRoleType, Quarter, QuarterPerson, QuarterProject } from './types';

export interface AddProjectToQuarterContext {
  quarter: Quarter;
  quarterProjects: QuarterProject[];
  quarterPeople: QuarterPerson[];
  projects: Project[];
  people: Person[];
  allProjectRoles: ProjectRole[];
  allAllocations: Allocation[];
  allQuarters: Quarter[];
}

export interface AddProjectToQuarterPlan {
  quarterProjectToCreate: QuarterProject;
  quarterRolesToCreate: ProjectRole[];
  quarterPeopleToCreate: QuarterPerson[];
  allocationPlans: ProjectCapacityAllocationPlan[];
}

export function projectRoleCreatesActiveQuarterEntry(roleType: ProjectRoleType): boolean {
  return roleType === 'DRI' || roleType === 'EM' || roleType === 'PM';
}

export function createQuarterProjectRecord(
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

export function planEnsureProjectInQuarter(
  quarter: Quarter | null,
  quarterProjects: QuarterProject[],
  project: Project,
  roleType: ProjectRoleType,
  createId: () => string,
): QuarterProject | null {
  if (!quarter || !projectRoleCreatesActiveQuarterEntry(roleType)) return null;
  const alreadyInQuarter = quarterProjects.some(
    (quarterProject) => quarterProject.quarterId === quarter.id && quarterProject.projectId === project.id,
  );
  if (alreadyInQuarter) return null;
  return createQuarterProjectRecord(quarter, quarterProjects.length, project, createId);
}

export function planAddProjectToQuarter(
  context: AddProjectToQuarterContext,
  projectId: string,
  createId: () => string,
): AddProjectToQuarterPlan | null {
  const { quarter, quarterProjects, quarterPeople, projects, people, allProjectRoles, allAllocations, allQuarters } = context;
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) return null;

  const projectRoles = allProjectRoles.filter((role) => role.projectId === projectId);
  const projectAllocations = allAllocations.filter((allocation) => allocation.projectId === projectId);
  const templateRoles = projectRoles.filter((role) => role.quarterId === '');
  const hasTemplateRoles = templateRoles.length > 0;

  let rolesToCopy = templateRoles;
  if (!hasTemplateRoles) {
    const previousNonEngineerRoles = projectRoles.filter(
      (role) => role.quarterId !== quarter.id && role.quarterId !== '' && role.role !== 'Engineer',
    );
    const previousQuarterIds = [...new Set(previousNonEngineerRoles.map((role) => role.quarterId))];
    if (previousQuarterIds.length > 0) {
      const latestQuarter = allQuarters
        .filter((candidate) => previousQuarterIds.includes(candidate.id))
        .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
      if (latestQuarter) {
        rolesToCopy = previousNonEngineerRoles.filter((role) => role.quarterId === latestQuarter.id);
      }
    }
  }

  const quarterRolesToCreate = rolesToCopy.map((role) => ({ ...role, id: createId(), quarterId: quarter.id }));
  const quarterPersonIds = new Set(quarterPeople.map((entry) => entry.personId));
  const quarterPeopleToCreate = hasTemplateRoles
    ? quarterRolesToCreate
      .filter((role) => projectRoleNeedsCapacity(role.role) && !quarterPersonIds.has(role.personId))
      .map((role) => {
        const person = people.find((candidate) => candidate.id === role.personId);
        if (!person) return null;
        quarterPersonIds.add(role.personId);
        return {
          id: createId(),
          quarterId: quarter.id,
          personId: role.personId,
          subteamId: person.subteamId,
          inactive: false,
          quarterCapacity: person.defaultCapacity,
          overheadOverride: null,
        };
      })
      .filter((entry) => entry !== null)
    : [];

  return {
    quarterProjectToCreate: createQuarterProjectRecord(quarter, quarterProjects.length, project, createId),
    quarterRolesToCreate,
    quarterPeopleToCreate,
    allocationPlans: hasTemplateRoles
      ? materializeTemplateAllocationsForQuarter(quarter, projectId, quarterRolesToCreate, projectAllocations, createId)
      : [],
  };
}
