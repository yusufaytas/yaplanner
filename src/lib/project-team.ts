import { normalizeSubteamName, suggestSubteamName } from './subteams';
import { getQuarterWeeks } from './weeks';
import type { Allocation, Person, Project, ProjectRole, ProjectRoleType, Quarter, QuarterPerson, Subteam } from './types';

export interface ProjectTeamContext {
  activeQuarterId: string | null;
  people: Person[];
  project: Project;
  projectRoles: ProjectRole[];
  quarterPeople: QuarterPerson[];
  subteams: Subteam[];
}

export interface ProjectTeamMutationPlan {
  roleUpdate?: { roleId: string; patch: Partial<ProjectRole> };
  roleToCreate?: ProjectRole;
  peopleUpdates: Array<{ personId: string; subteamId: string | null }>;
  projectPatch?: Partial<Project>;
  quarterPeopleUpdates: Array<{ quarterPersonId: string; subteamId: string | null }>;
  subteamToCreate?: Subteam;
  subteamToUpdate?: { id: string; patch: Partial<Subteam> };
}

export interface PersonProjectCapacityShare {
  projectId: string;
  percentage: number;
  isEvenSplit: boolean;
}

export interface ProjectCapacityAllocationPlan {
  allocationsToDelete: string[];
  allocationsToUpsert: Allocation[];
  percentage: number;
}

export type ProjectTeamRuleError =
  | 'duplicate_dri'
  | 'duplicate_person'
  | 'engineer_requires_dri'
  | 'missing_person'
  | 'missing_role';

function uniqueProjectIds(projectIds: string[]): string[] {
  return [...new Set(projectIds)];
}

export function personNeedsProjectCapacity(personRole: string): boolean {
  return personRole === 'Engineer';
}

export function getProjectCapacityMinimum(
  personId: string,
  projectId: string,
  activeProjectRoles: ProjectRole[],
): number {
  return activeProjectRoles.some(
    (projectRole) =>
      projectRole.personId === personId &&
      projectRole.projectId === projectId &&
      projectRole.role === 'DRI',
  )
    ? 50
    : 0;
}

export function getPersonProjectCapacityShares(
  personId: string,
  defaultCapacity: number,
  assignedProjectIds: string[],
  activeProjectRoles: ProjectRole[],
  allocations: Allocation[],
): PersonProjectCapacityShare[] {
  const uniqueAssignedProjectIds = uniqueProjectIds(assignedProjectIds);
  const avgByProject = new Map<string, number>();

  for (const projectId of uniqueAssignedProjectIds) {
    const projectAllocations = allocations.filter((allocation) => allocation.projectId === projectId);
    if (projectAllocations.length === 0) continue;

    const weeklyTotals = new Map<string, number>();
    for (const allocation of projectAllocations) {
      weeklyTotals.set(
        allocation.weekStart,
        (weeklyTotals.get(allocation.weekStart) ?? 0) + allocation.percentage,
      );
    }

    const avg = Math.round(
      Array.from(weeklyTotals.values()).reduce((sum, value) => sum + value, 0) / weeklyTotals.size,
    );
    avgByProject.set(projectId, Math.max(avg, getProjectCapacityMinimum(personId, projectId, activeProjectRoles)));
  }

  const totalExplicit = Array.from(avgByProject.values()).reduce((sum, value) => sum + value, 0);
  const projectsWithoutExplicitAllocation = uniqueAssignedProjectIds.filter((projectId) => !avgByProject.has(projectId));
  const minimumByProject = new Map(
    projectsWithoutExplicitAllocation.map((projectId) => [
      projectId,
      getProjectCapacityMinimum(personId, projectId, activeProjectRoles),
    ]),
  );
  const minimumReserved = Array.from(minimumByProject.values()).reduce((sum, value) => sum + value, 0);
  const distributableRemainder = Math.max(0, defaultCapacity - totalExplicit - minimumReserved);
  const remainderProjectIds = projectsWithoutExplicitAllocation.filter(
    (projectId) => (minimumByProject.get(projectId) ?? 0) === 0,
  );
  const distributionProjectIds = remainderProjectIds.length > 0 ? remainderProjectIds : projectsWithoutExplicitAllocation;
  const evenShare = distributionProjectIds.length > 0
    ? Math.round(distributableRemainder / distributionProjectIds.length)
    : 0;

  return uniqueAssignedProjectIds.map((projectId) => {
    const explicitPercentage = avgByProject.get(projectId);
    const receivesRemainder = distributionProjectIds.includes(projectId);
    return {
      projectId,
      percentage: explicitPercentage ?? (minimumByProject.get(projectId) ?? 0) + (receivesRemainder ? evenShare : 0),
      isEvenSplit: explicitPercentage === undefined,
    };
  });
}

export function getProjectReservedCapacity(
  projectId: string,
  people: Person[],
  activeProjectRoles: ProjectRole[],
  activeAllocations: Allocation[],
): number {
  const assignedPeople = people.filter((person) =>
    activeProjectRoles.some((projectRole) => projectRole.projectId === projectId && projectRole.personId === person.id),
  );

  return assignedPeople.reduce((sum, person) => {
    if (!personNeedsProjectCapacity(person.role)) return sum;
    const assignedProjectIds = activeProjectRoles
      .filter((projectRole) => projectRole.personId === person.id)
      .map((projectRole) => projectRole.projectId);
    const personAllocations = activeAllocations.filter((allocation) => allocation.personId === person.id);
    const shares = getPersonProjectCapacityShares(
      person.id,
      person.defaultCapacity,
      assignedProjectIds,
      activeProjectRoles,
      personAllocations,
    );
    const projectShare = shares.find((share) => share.projectId === projectId);
    return sum + (projectShare?.percentage ?? 0);
  }, 0);
}

export function getPersonProjectCapacityShare(
  person: Pick<Person, 'id' | 'role' | 'defaultCapacity'>,
  projectId: string,
  activeProjectRoles: ProjectRole[],
  activeAllocations: Allocation[],
): PersonProjectCapacityShare {
  if (!personNeedsProjectCapacity(person.role)) {
    return { projectId, percentage: 0, isEvenSplit: false };
  }

  const assignedProjectIds = activeProjectRoles
    .filter((projectRole) => projectRole.personId === person.id)
    .map((projectRole) => projectRole.projectId);
  const personAllocations = activeAllocations.filter((allocation) => allocation.personId === person.id);
  const share = getPersonProjectCapacityShares(
    person.id,
    person.defaultCapacity,
    assignedProjectIds,
    activeProjectRoles,
    personAllocations,
  )
    .find((projectCapacityShare) => projectCapacityShare.projectId === projectId);

  return share ?? { projectId, percentage: 0, isEvenSplit: true };
}

export function planQuarterProjectAllocation(
  quarter: Quarter,
  personId: string,
  projectId: string,
  percentage: number,
  activeProjectRoles: ProjectRole[],
  existingAllocations: Allocation[],
  createId: () => string,
): ProjectCapacityAllocationPlan {
  const minimumPercentage = getProjectCapacityMinimum(personId, projectId, activeProjectRoles);
  const clampedPercentage = Math.max(minimumPercentage, Math.min(100, Math.round(percentage)));
  const matchingAllocations = existingAllocations.filter(
    (allocation) =>
      allocation.quarterId === quarter.id &&
      allocation.personId === personId &&
      allocation.projectId === projectId,
  );

  if (clampedPercentage === 0) {
    return {
      allocationsToDelete: matchingAllocations.map((allocation) => allocation.id),
      allocationsToUpsert: [],
      percentage: 0,
    };
  }

  const quarterWeeks = new Set(getQuarterWeeks(quarter.startDate, quarter.endDate));
  const allocationByWeek = new Map(matchingAllocations.map((allocation) => [allocation.weekStart, allocation]));
  const allocationsToUpsert = Array.from(quarterWeeks).map((weekStart) => {
    const existingAllocation = allocationByWeek.get(weekStart);
    return {
      id: existingAllocation?.id ?? createId(),
      quarterId: quarter.id,
      personId,
      projectId,
      weekStart,
      percentage: clampedPercentage,
    };
  });

  return {
    allocationsToDelete: matchingAllocations
      .filter((allocation) => !quarterWeeks.has(allocation.weekStart))
      .map((allocation) => allocation.id),
    allocationsToUpsert,
    percentage: clampedPercentage,
  };
}

interface PlannerDeps {
  createId: () => string;
  nowIso: () => string;
}

function currentDri(projectRoles: ProjectRole[]): ProjectRole | undefined {
  return projectRoles.find((role) => role.role === 'DRI');
}

function hasProjectPerson(projectRoles: ProjectRole[], personId: string, excludingRoleId?: string): boolean {
  return projectRoles.some((role) => role.personId === personId && role.id !== excludingRoleId);
}

function findPerson(people: Person[], personId: string): Person | undefined {
  return people.find((person) => person.id === personId);
}

function findQuarterPerson(
  quarterPeople: QuarterPerson[],
  activeQuarterId: string | null,
  personId: string,
): QuarterPerson | undefined {
  if (!activeQuarterId) return undefined;
  return quarterPeople.find(
    (quarterPerson) =>
      quarterPerson.quarterId === activeQuarterId &&
      quarterPerson.personId === personId,
  );
}

function attachEngineerPlan(
  context: ProjectTeamContext,
  personId: string,
  subteamId: string | null,
): Pick<ProjectTeamMutationPlan, 'peopleUpdates' | 'quarterPeopleUpdates'> {
  const peopleUpdates = [{ personId, subteamId }];
  const quarterPerson = findQuarterPerson(context.quarterPeople, context.activeQuarterId, personId);
  const quarterPeopleUpdates = quarterPerson
    ? [{ quarterPersonId: quarterPerson.id, subteamId }]
    : [];

  return { peopleUpdates, quarterPeopleUpdates };
}

function ensureProjectSubteamPlan(
  context: ProjectTeamContext,
  driPersonId: string,
  deps: PlannerDeps,
): Pick<ProjectTeamMutationPlan, 'projectPatch' | 'subteamToCreate' | 'subteamToUpdate'> & {
  subteamId: string;
} {
  const fallbackSubteamName = normalizeSubteamName(suggestSubteamName(context.project.name));
  const existingSubteam = context.project.owningSubteamId
    ? context.subteams.find((subteam) => subteam.id === context.project.owningSubteamId)
    : context.subteams.find((subteam) => subteam.name === fallbackSubteamName);

  if (existingSubteam) {
    return {
      subteamId: existingSubteam.id,
      projectPatch: context.project.owningSubteamId
        ? undefined
        : { owningSubteamId: existingSubteam.id },
      subteamToUpdate: { id: existingSubteam.id, patch: { driPersonId } },
    };
  }

  const subteamId = deps.createId();
  return {
    subteamId,
    projectPatch: { owningSubteamId: subteamId },
    subteamToCreate: {
      id: subteamId,
      name: fallbackSubteamName,
      purpose: `Delivery subteam for ${context.project.name}`,
      driPersonId,
      createdAt: deps.nowIso(),
    },
  };
}

export function getProjectRoleOptions(projectRoles: ProjectRole[]): ProjectRoleType[] {
  const hasDri = Boolean(currentDri(projectRoles));
  return (['DRI', 'Engineer', 'EM', 'PM'] as ProjectRoleType[]).filter((roleType) => {
    if (roleType === 'DRI') return !hasDri;
    if (roleType === 'Engineer') return hasDri;
    return true;
  });
}

export function getDefaultProjectRoleType(projectRoles: ProjectRole[]): ProjectRoleType {
  return currentDri(projectRoles) ? 'Engineer' : 'DRI';
}

export function personMatchesProjectRole(role: ProjectRoleType, personRole: string): boolean {
  if (role === 'PM') return personRole === 'PM';
  if (role === 'EM') return personRole === 'EM';
  return personRole === 'Engineer';
}

export function getEditableProjectRoleOptions(
  projectRoles: ProjectRole[],
  currentRole: ProjectRoleType,
): ProjectRoleType[] {
  const allowedRoleOptions = new Set(getProjectRoleOptions(projectRoles));
  return (['DRI', 'Engineer', 'EM', 'PM'] as ProjectRoleType[]).filter(
    (roleType) => roleType === currentRole || allowedRoleOptions.has(roleType),
  );
}

export function getAssignablePeopleForProjectRole(
  people: Person[],
  projectRoles: ProjectRole[],
  roleType: ProjectRoleType,
  currentPersonId?: string,
): Person[] {
  const assignedPersonIds = new Set(projectRoles.map((role) => role.personId));
  return people.filter((person) => {
    if (!personMatchesProjectRole(roleType, person.role)) return false;
    if (person.id === currentPersonId) return true;
    return !assignedPersonIds.has(person.id);
  });
}

export function planAddProjectRole(
  context: ProjectTeamContext,
  roleType: ProjectRoleType,
  personId: string,
  deps: PlannerDeps,
): ProjectTeamMutationPlan | ProjectTeamRuleError {
  const person = findPerson(context.people, personId);
  if (!person) return 'missing_person';

  const dri = currentDri(context.projectRoles);
  if (roleType === 'DRI' && dri) return 'duplicate_dri';
  if (hasProjectPerson(context.projectRoles, personId)) return 'duplicate_person';
  if (roleType === 'Engineer' && !dri) return 'engineer_requires_dri';

  const roleToCreate: ProjectRole = {
    id: deps.createId(),
    quarterId: context.activeQuarterId ?? '',
    projectId: context.project.id,
    personId,
    role: roleType,
  };

  if (roleType === 'DRI') {
    const subteamPlan = ensureProjectSubteamPlan(context, personId, deps);
    const engineerAttachment = person.role === 'Engineer'
      ? attachEngineerPlan(context, personId, subteamPlan.subteamId)
      : { peopleUpdates: [], quarterPeopleUpdates: [] };

    return {
      roleToCreate,
      projectPatch: subteamPlan.projectPatch,
      subteamToCreate: subteamPlan.subteamToCreate,
      subteamToUpdate: subteamPlan.subteamToUpdate,
      peopleUpdates: engineerAttachment.peopleUpdates,
      quarterPeopleUpdates: engineerAttachment.quarterPeopleUpdates,
    };
  }

  if (roleType === 'Engineer') {
    const engineerAttachment = attachEngineerPlan(context, personId, context.project.owningSubteamId);
    return {
      roleToCreate,
      peopleUpdates: engineerAttachment.peopleUpdates,
      quarterPeopleUpdates: engineerAttachment.quarterPeopleUpdates,
    };
  }

  return {
    roleToCreate,
    peopleUpdates: [],
    quarterPeopleUpdates: [],
  };
}

export function planProjectRoleTypeChange(
  context: ProjectTeamContext,
  roleId: string,
  nextRole: ProjectRoleType,
  deps: PlannerDeps,
): ProjectTeamMutationPlan | ProjectTeamRuleError {
  const role = context.projectRoles.find((projectRole) => projectRole.id === roleId);
  if (!role) return 'missing_role';

  const dri = currentDri(context.projectRoles);
  if (nextRole === 'DRI' && dri && dri.id !== roleId) return 'duplicate_dri';
  if (nextRole === 'Engineer' && !dri) return 'engineer_requires_dri';

  const person = findPerson(context.people, role.personId);
  const roleUpdate = { roleId, patch: { role: nextRole } };

  if (nextRole === 'DRI') {
    const subteamPlan = ensureProjectSubteamPlan(context, role.personId, deps);
    const engineerAttachment = person?.role === 'Engineer'
      ? attachEngineerPlan(context, role.personId, subteamPlan.subteamId)
      : { peopleUpdates: [], quarterPeopleUpdates: [] };

    return {
      roleUpdate,
      projectPatch: subteamPlan.projectPatch,
      subteamToCreate: subteamPlan.subteamToCreate,
      subteamToUpdate: subteamPlan.subteamToUpdate,
      peopleUpdates: engineerAttachment.peopleUpdates,
      quarterPeopleUpdates: engineerAttachment.quarterPeopleUpdates,
    };
  }

  if (nextRole === 'Engineer') {
    const engineerAttachment = attachEngineerPlan(context, role.personId, context.project.owningSubteamId);
    return {
      roleUpdate,
      peopleUpdates: engineerAttachment.peopleUpdates,
      quarterPeopleUpdates: engineerAttachment.quarterPeopleUpdates,
    };
  }

  return {
    roleUpdate,
    peopleUpdates: [],
    quarterPeopleUpdates: [],
  };
}

export function planProjectRolePersonChange(
  context: ProjectTeamContext,
  roleId: string,
  personId: string,
  deps: PlannerDeps,
): ProjectTeamMutationPlan | ProjectTeamRuleError {
  const role = context.projectRoles.find((projectRole) => projectRole.id === roleId);
  if (!role) return 'missing_role';

  const person = findPerson(context.people, personId);
  if (!person) return 'missing_person';
  if (hasProjectPerson(context.projectRoles, personId, roleId)) return 'duplicate_person';

  const roleUpdate = { roleId, patch: { personId } };

  if (role.role === 'DRI') {
    const subteamPlan = ensureProjectSubteamPlan(context, personId, deps);
    const engineerAttachment = person.role === 'Engineer'
      ? attachEngineerPlan(context, personId, subteamPlan.subteamId)
      : { peopleUpdates: [], quarterPeopleUpdates: [] };

    return {
      roleUpdate,
      projectPatch: subteamPlan.projectPatch,
      subteamToCreate: subteamPlan.subteamToCreate,
      subteamToUpdate: subteamPlan.subteamToUpdate,
      peopleUpdates: engineerAttachment.peopleUpdates,
      quarterPeopleUpdates: engineerAttachment.quarterPeopleUpdates,
    };
  }

  if (role.role === 'Engineer') {
    const engineerAttachment = attachEngineerPlan(context, personId, context.project.owningSubteamId);
    return {
      roleUpdate,
      peopleUpdates: engineerAttachment.peopleUpdates,
      quarterPeopleUpdates: engineerAttachment.quarterPeopleUpdates,
    };
  }

  return {
    roleUpdate,
    peopleUpdates: [],
    quarterPeopleUpdates: [],
  };
}
