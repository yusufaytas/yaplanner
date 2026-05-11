import { db } from './db';
import { clampProjectAllocationPercentage, getMaxProjectAllocationPercentage, personTracksCapacity } from './person-capacity';
import { listResolvedQuarters } from './quarters';
import { parseProjectTagsInput } from './project-tags';
import type { Allocation, Project, ProjectStatus, Quarter, RiskImpact, RiskLikelihood, Role, Subteam } from './types';

function uid() {
  return crypto.randomUUID();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export interface EnsureProjectSubteamPlan {
  projectPatch?: Pick<Project, 'subteamId'>;
  subteamId: string;
  subteamToCreate?: Subteam;
}

export interface SubteamAllocationPropagationPlan {
  allocationsToUpsert: Allocation[];
  projectPatch?: Pick<Project, 'subteamId'>;
  subteamToCreate?: Subteam;
  subteamId: string;
}

export interface RemovePersonFromProjectPlan {
  allocationsToDelete: string[];
  allocationsToEnd: Allocation[];
}

const DELIVERY_ROLES: Role[] = ['Engineer', 'DRI'];

function isActiveAllocation(allocation: Allocation): boolean {
  return allocation.endDate === null;
}

function isDeliveryRole(role: Role): boolean {
  return DELIVERY_ROLES.includes(role);
}

function getProjectsInSubteam(project: Project, projects: Project[], subteamId: string): Project[] {
  const siblingProjects = projects.filter((candidate) => candidate.subteamId === subteamId);
  return siblingProjects.some((candidate) => candidate.id === project.id)
    ? siblingProjects
    : [project, ...siblingProjects];
}

function getAllocationStartDate(quarter: Quarter | null, today: string): string {
  if (!quarter) return today;
  return today < quarter.startDate ? quarter.startDate : today;
}

function getActiveProjectPersonAllocation(
  allocations: Allocation[],
  projectId: string,
  personId: string,
): Allocation | null {
  return allocations.find(
    (allocation) => allocation.projectId === projectId && allocation.personId === personId && isActiveAllocation(allocation),
  ) ?? null;
}

function buildAllocation(params: {
  createId: () => string;
  existingAllocation?: Allocation | null;
  personId: string;
  projectId: string;
  quarter: Quarter | null;
  role: Role;
  percentage: number;
  startDate: string;
}): Allocation {
  const { createId, existingAllocation, personId, projectId, quarter, role, percentage, startDate } = params;
  return {
    id: createId(),
    quarterId: existingAllocation?.quarterId ?? quarter?.id ?? null,
    personId,
    projectId,
    role,
    startDate,
    endDate: null,
    percentage,
  };
}

function endAllocation(allocation: Allocation, today: string): Allocation {
  return { ...allocation, endDate: today };
}

function getDefaultSiblingRole(role: Role): Role {
  return role === 'DRI' ? 'Engineer' : role;
}

export function planEnsureProjectSubteam(
  project: Project,
  createId: () => string,
  nowIso = new Date().toISOString(),
): EnsureProjectSubteamPlan {
  if (project.subteamId) {
    return { subteamId: project.subteamId };
  }

  const subteamId = createId();
  return {
    subteamId,
    projectPatch: { subteamId },
    subteamToCreate: {
      id: subteamId,
      name: project.name,
      purpose: `Delivery subteam for ${project.name}`,
      createdAt: nowIso,
    },
  };
}

export function planAddPersonToProjectSubteam(params: {
  allocations: Allocation[];
  createId: () => string;
  personId: string;
  percentage?: number;
  project: Project;
  projects: Project[];
  quarter: Quarter | null;
  role: Role;
  today?: string;
}): SubteamAllocationPropagationPlan {
  const { allocations, createId, personId, percentage = 0, project, projects, quarter, role } = params;
  const today = params.today ?? todayDate();
  const ensuredSubteam = planEnsureProjectSubteam(project, createId, `${today}T00:00:00.000Z`);
  const siblingProjects = isDeliveryRole(role)
    ? getProjectsInSubteam(project, projects, ensuredSubteam.subteamId)
    : [project];
  const startDate = getAllocationStartDate(quarter, today);
  const allocationsToUpsert: Allocation[] = [];

  for (const siblingProject of siblingProjects) {
    const existing = getActiveProjectPersonAllocation(allocations, siblingProject.id, personId);
    const desiredRole = siblingProject.id === project.id ? role : getDefaultSiblingRole(role);
    const desiredPercentage = siblingProject.id === project.id ? percentage : 0;

    if (existing) {
      if (siblingProject.id !== project.id) continue;
      if (existing.role === desiredRole) continue;
      allocationsToUpsert.push(endAllocation(existing, today));
      allocationsToUpsert.push(buildAllocation({
        createId,
        existingAllocation: existing,
        personId,
        projectId: siblingProject.id,
        quarter,
        role: desiredRole,
        percentage: existing.percentage,
        startDate,
      }));
      continue;
    }

    allocationsToUpsert.push(buildAllocation({
      createId,
      personId,
      projectId: siblingProject.id,
      quarter,
      role: desiredRole,
      percentage: desiredPercentage,
      startDate,
    }));
  }

  return {
    allocationsToUpsert,
    projectPatch: ensuredSubteam.projectPatch,
    subteamToCreate: ensuredSubteam.subteamToCreate,
    subteamId: ensuredSubteam.subteamId,
  };
}

export function planSetProjectDri(params: {
  allocations: Allocation[];
  createId: () => string;
  personId: string;
  percentage?: number;
  project: Project;
  projects: Project[];
  quarter: Quarter | null;
  today?: string;
}): SubteamAllocationPropagationPlan {
  const { allocations, createId, personId, percentage = 0, project, projects, quarter } = params;
  const today = params.today ?? todayDate();
  const basePlan = planAddPersonToProjectSubteam({
    allocations,
    createId,
    personId,
    percentage,
    project,
    projects,
    quarter,
    role: 'DRI',
    today,
  });
  const startDate = getAllocationStartDate(quarter, today);
  const allocationsToUpsert = [...basePlan.allocationsToUpsert];
  const targetProjectDriRows = allocations.filter(
    (allocation) => allocation.projectId === project.id && allocation.role === 'DRI' && allocation.personId !== personId && isActiveAllocation(allocation),
  );

  for (const currentDri of targetProjectDriRows) {
    allocationsToUpsert.push(endAllocation(currentDri, today));
    const replacementExists = allocations.some(
      (allocation) => allocation.projectId === project.id
        && allocation.personId === currentDri.personId
        && allocation.role === 'Engineer'
        && isActiveAllocation(allocation),
    ) || allocationsToUpsert.some(
      (allocation) => allocation.projectId === project.id
        && allocation.personId === currentDri.personId
        && allocation.role === 'Engineer'
        && isActiveAllocation(allocation),
    );
    if (!replacementExists) {
      allocationsToUpsert.push(buildAllocation({
        createId,
        existingAllocation: currentDri,
        personId: currentDri.personId,
        projectId: project.id,
        quarter,
        role: 'Engineer',
        percentage: currentDri.percentage,
        startDate,
      }));
    }
  }

  return { ...basePlan, allocationsToUpsert };
}

function roleScopedProjectIds(params: {
  allocations: Allocation[];
  personId: string;
  project: Project;
  projects: Project[];
}): string[] {
  const { allocations, personId, project, projects } = params;
  const activeRolesOnProject = allocations.filter(
    (allocation) => allocation.personId === personId
      && allocation.projectId === project.id
      && isActiveAllocation(allocation),
  );
  const hasDeliveryRoleOnProject = activeRolesOnProject.some((allocation) => isDeliveryRole(allocation.role));
  if (!hasDeliveryRoleOnProject || !project.subteamId) {
    return [project.id];
  }
  return getProjectsInSubteam(project, projects, project.subteamId).map((candidate) => candidate.id);
}

export function planRemovePersonFromProjectSubteam(params: {
  allocations: Allocation[];
  personId: string;
  project: Project;
  projects: Project[];
  today?: string;
}): RemovePersonFromProjectPlan {
  const { allocations, personId, project, projects } = params;
  const today = params.today ?? todayDate();
  const oneWeekAgo = new Date(new Date(today).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const relevantProjectIds = new Set(roleScopedProjectIds({ allocations, personId, project, projects }));
  const relevant = allocations.filter(
    (allocation) => allocation.personId === personId
      && allocation.projectId !== null
      && relevantProjectIds.has(allocation.projectId)
      && isActiveAllocation(allocation),
  );

  const allocationsToDelete: string[] = [];
  const allocationsToEnd: Allocation[] = [];

  for (const allocation of relevant) {
    if (allocation.startDate !== null && allocation.startDate > oneWeekAgo) {
      allocationsToDelete.push(allocation.id);
    } else {
      allocationsToEnd.push(endAllocation(allocation, today));
    }
  }

  return { allocationsToDelete, allocationsToEnd };
}

export function planSyncProjectToSubteamRoster(params: {
  allocations: Allocation[];
  createId: () => string;
  project: Project;
  projects: Project[];
  quarter: Quarter | null;
  today?: string;
}): Allocation[] {
  const { allocations, createId, project, projects, quarter } = params;
  if (!project.subteamId) return [];

  const siblingProjects = getProjectsInSubteam(project, projects, project.subteamId).filter(
    (candidate) => candidate.id !== project.id,
  );
  if (siblingProjects.length === 0) return [];

  const siblingProjectIds = new Set(siblingProjects.map((candidate) => candidate.id));
  const activeSiblingAllocations = allocations.filter(
    (allocation) => allocation.projectId !== null
      && siblingProjectIds.has(allocation.projectId)
      && isActiveAllocation(allocation),
  );
  const activeTargetPersonIds = new Set(
    allocations
      .filter((allocation) => allocation.projectId === project.id && isActiveAllocation(allocation))
      .map((allocation) => allocation.personId),
  );
  const rosterByPersonId = new Map<string, Allocation[]>();

  for (const allocation of activeSiblingAllocations) {
    if (!isDeliveryRole(allocation.role)) continue;
    const entries = rosterByPersonId.get(allocation.personId) ?? [];
    entries.push(allocation);
    rosterByPersonId.set(allocation.personId, entries);
  }

  const startDate = getAllocationStartDate(quarter, params.today ?? todayDate());
  const allocationsToCreate: Allocation[] = [];

  for (const personId of rosterByPersonId.keys()) {
    if (activeTargetPersonIds.has(personId)) continue;
    allocationsToCreate.push(buildAllocation({
      createId,
      personId,
      projectId: project.id,
      quarter,
      role: 'Engineer',
      percentage: 0,
      startDate,
    }));
  }

  return allocationsToCreate;
}

export async function getProjectPageData(projectId: string) {
  const [project, projects, people, subteams, quarters, allocations, quarterPeople, quarterProjects] = await Promise.all([
    db.projects.get(projectId),
    db.projects.toArray(),
    db.people.orderBy('name').toArray(),
    db.subteams.toArray(),
    listResolvedQuarters(),
    db.allocations.toArray(),
    db.quarterPeople.toArray(),
    db.quarterProjects.where('projectId').equals(projectId).toArray(),
  ]);
  return { project, projects, people, subteams, quarters, allocations, quarterPeople, quarterProjects };
}

export async function getHomePageData() {
  const [people, subteams, projects, quarters, allocations, quarterPeople] = await Promise.all([
    db.people.toArray(),
    db.subteams.toArray(),
    db.projects.where('status').equals('Active').toArray(),
    listResolvedQuarters(),
    db.allocations.toArray(),
    db.quarterPeople.toArray(),
  ]);
  return { people, subteams, projects, quarters, allocations, quarterPeople };
}

export async function getProjectsPageData() {
  const [projects, people, allocations, quarters, quarterPeople] = await Promise.all([
    db.projects.orderBy('name').toArray(),
    db.people.toArray(),
    db.allocations.toArray(),
    listResolvedQuarters(),
    db.quarterPeople.toArray(),
  ]);
  return { projects, people, allocations, quarters, quarterPeople };
}

export async function createProject(params: {
  id: string;
  name: string;
  status: ProjectStatus;
}) {
  const { id, name, status } = params;
  await db.projects.add({
    id,
    name: name.trim(),
    description: '',
    status,
    tags: [],
    subteamId: null,
    createdAt: new Date().toISOString(),
    archivedAt: null,
    links: [],
    unknowns: [],
    risks: [],
  });
}

export async function deleteProjectCascade(projectId: string, subteamId: string | null) {
  await db.transaction(
    'rw',
    [db.projects, db.allocations, db.quarterProjects, db.subteams],
    async () => {
      await db.allocations.bulkDelete(
        (await db.allocations.where('projectId').equals(projectId).toArray()).map((row) => row.id),
      );
      await db.quarterProjects.bulkDelete(
        (await db.quarterProjects.where('projectId').equals(projectId).toArray()).map((row) => row.id),
      );

      if (subteamId) {
        await db.subteams.delete(subteamId);
      }

      await db.projects.delete(projectId);
    },
  );
}

export async function updateProjectName(projectId: string, name: string) {
  await db.projects.update(projectId, { name });
}

export async function updateProjectDescription(projectId: string, description: string) {
  await db.projects.update(projectId, { description });
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  await db.projects.update(projectId, { status });
}

export async function updateProjectTags(projectId: string, rawTags: string) {
  await db.projects.update(projectId, { tags: parseProjectTagsInput(rawTags) });
}

export async function addProjectMember(params: {
  activeQuarter: Quarter | null;
  allocations: Awaited<ReturnType<typeof getProjectPageData>>['allocations'];
  personId: string;
  people: Awaited<ReturnType<typeof getProjectPageData>>['people'];
  percentage: number;
  project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>;
  projects: Awaited<ReturnType<typeof getProjectPageData>>['projects'];
  quarterPeople: Awaited<ReturnType<typeof getProjectPageData>>['quarterPeople'];
  role: Role;
}) {
  const { activeQuarter, allocations, personId, people, percentage, project, projects, quarterPeople, role } = params;
  const person = people.find((entry) => entry.id === personId);
  const quarterPerson = activeQuarter
    ? quarterPeople.find((entry) => entry.personId === personId && entry.quarterId === activeQuarter.id)
    : undefined;
  const clampedPercentage = person && personTracksCapacity(role)
    ? clampProjectAllocationPercentage({
      person,
      projectId: project.id,
      quarterPerson,
      quarterId: activeQuarter?.id ?? null,
      allocations,
      requestedPercentage: percentage,
    })
    : 0;

  if (role === 'DRI') {
    const plan = planSetProjectDri({
      allocations,
      createId: uid,
      personId,
      percentage: clampedPercentage,
      project,
      projects,
      quarter: activeQuarter,
    });
    await db.transaction('rw', [db.subteams, db.projects, db.allocations], async () => {
      if (plan.subteamToCreate) await db.subteams.add(plan.subteamToCreate);
      if (plan.projectPatch) await db.projects.update(project.id, plan.projectPatch);
      if (plan.allocationsToUpsert.length > 0) await db.allocations.bulkPut(plan.allocationsToUpsert);
    });
    return;
  }

  if (role === 'Engineer') {
    const plan = planAddPersonToProjectSubteam({
      allocations,
      createId: uid,
      personId,
      percentage: clampedPercentage,
      project,
      projects,
      quarter: activeQuarter,
      role: 'Engineer',
    });
    await db.transaction('rw', [db.subteams, db.projects, db.allocations], async () => {
      if (plan.subteamToCreate) await db.subteams.add(plan.subteamToCreate);
      if (plan.projectPatch) await db.projects.update(project.id, plan.projectPatch);
      if (plan.allocationsToUpsert.length > 0) await db.allocations.bulkPut(plan.allocationsToUpsert);
    });
    return;
  }

  await db.allocations.add({
    id: uid(),
    quarterId: activeQuarter?.id ?? null,
    projectId: project.id,
    personId,
    role,
    startDate: activeQuarter?.startDate ?? todayDate(),
    endDate: null,
    percentage: 0,
  });
}

export async function removeProjectMember(params: {
  allocations: Awaited<ReturnType<typeof getProjectPageData>>['allocations'];
  currentProjectAllocations: Awaited<ReturnType<typeof getProjectPageData>>['allocations'];
  personId: string;
  project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>;
  projects: Awaited<ReturnType<typeof getProjectPageData>>['projects'];
  role: Role;
}) {
  const { allocations, currentProjectAllocations, personId, project, projects, role } = params;

  if (role === 'Engineer' || role === 'DRI') {
    const plan = planRemovePersonFromProjectSubteam({
      allocations,
      personId,
      project,
      projects,
    });
    await db.transaction('rw', db.allocations, async () => {
      if (plan.allocationsToDelete.length > 0) await db.allocations.bulkDelete(plan.allocationsToDelete);
      if (plan.allocationsToEnd.length > 0) await db.allocations.bulkPut(plan.allocationsToEnd);
    });
    return;
  }

  const allocation = currentProjectAllocations.find((entry) => entry.personId === personId && entry.role === role && entry.endDate === null);
  if (!allocation) return;

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (allocation.startDate !== null && allocation.startDate > oneWeekAgo) {
    await db.allocations.delete(allocation.id);
    return;
  }

  await db.allocations.update(allocation.id, { endDate: todayDate() });
}

export async function addProjectLink(project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>, label: string, url: string) {
  await db.projects.update(project.id, {
    links: [...project.links, { id: uid(), label: label.trim(), url: url.trim() }],
  });
}

export async function removeProjectLink(project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>, linkId: string) {
  await db.projects.update(project.id, {
    links: project.links.filter((link) => link.id !== linkId),
  });
}

export async function addProjectUnknown(params: {
  activeQuarter: Quarter;
  description: string;
  project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>;
  title: string;
}) {
  const { activeQuarter, description, project, title } = params;
  await db.projects.update(project.id, {
    unknowns: [
      ...project.unknowns,
      {
        id: uid(),
        quarterId: activeQuarter.id,
        title: title.trim(),
        description: description.trim(),
        resolved: false,
        resolvedAt: null,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}

export async function toggleProjectUnknownResolved(project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>, unknownId: string, resolved: boolean) {
  await db.projects.update(project.id, {
    unknowns: project.unknowns.map((unknown) => (
      unknown.id === unknownId
        ? { ...unknown, resolved, resolvedAt: resolved ? new Date().toISOString() : null }
        : unknown
    )),
  });
}

export async function addProjectRisk(params: {
  activeQuarter: Quarter;
  impact: RiskImpact;
  likelihood: RiskLikelihood;
  mitigationNote: string;
  project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>;
  title: string;
}) {
  const { activeQuarter, impact, likelihood, mitigationNote, project, title } = params;
  await db.projects.update(project.id, {
    risks: [
      ...project.risks,
      {
        id: uid(),
        quarterId: activeQuarter.id,
        title: title.trim(),
        likelihood,
        impact,
        mitigationNote: mitigationNote.trim(),
        mitigated: false,
        mitigatedAt: null,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}

export async function toggleProjectRiskMitigated(project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>, riskId: string, mitigated: boolean) {
  await db.projects.update(project.id, {
    risks: project.risks.map((risk) => (
      risk.id === riskId
        ? { ...risk, mitigated, mitigatedAt: mitigated ? new Date().toISOString() : null }
        : risk
    )),
  });
}

export async function updateProjectMemberAllocationPercentage(params: {
  allocations: Awaited<ReturnType<typeof getProjectPageData>>['allocations'];
  personId: string;
  projectId: string;
  percentage: number;
}) {
  const { allocations, personId, projectId, percentage } = params;
  const activeDeliveryAllocations = allocations.filter(
    (allocation) => allocation.personId === personId
      && allocation.projectId === projectId
      && allocation.endDate === null
      && (allocation.role === 'Engineer' || allocation.role === 'DRI'),
  );

  if (activeDeliveryAllocations.length === 0) return;
  const person = await db.people.get(personId);
  if (!person || !personTracksCapacity(person.role)) return;
  const quarterId = activeDeliveryAllocations[0]?.quarterId ?? null;
  const quarterPerson = quarterId
    ? await db.quarterPeople.where({ quarterId, personId }).first()
    : undefined;
  const clamped = clampProjectAllocationPercentage({
    person,
    projectId,
    quarterPerson,
    quarterId,
    allocations,
    requestedPercentage: percentage,
  });

  await db.allocations.bulkPut(
    activeDeliveryAllocations.map((allocation) => ({
      ...allocation,
      percentage: clamped,
    })),
  );
}

export function getProjectMemberAllocationMax(params: {
  allocations: Awaited<ReturnType<typeof getProjectPageData>>['allocations'];
  person: Awaited<ReturnType<typeof getProjectPageData>>['people'][number];
  projectId: string;
  quarterId?: string | null;
  quarterPeople?: Awaited<ReturnType<typeof getProjectPageData>>['quarterPeople'];
}) {
  const { allocations, person, projectId, quarterId, quarterPeople = [] } = params;
  const quarterPerson = quarterId
    ? quarterPeople.find((entry) => entry.personId === person.id && entry.quarterId === quarterId)
    : undefined;
  return getMaxProjectAllocationPercentage({
    person,
    projectId,
    quarterPerson,
    quarterId,
    allocations,
  });
}
