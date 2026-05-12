import { db } from './db';
import { clampProjectAllocationPercentage, getMaxProjectAllocationPercentage, personTracksCapacity } from './person-capacity';
import { listResolvedCycles } from './cycles';
import { parseProjectTagsInput } from './project-tags';
import type { Allocation, Project, ProjectStatus, Cycle, RiskImpact, RiskLikelihood, Role, Subteam } from './types';

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

function hasActiveDriForProjectSubteam(
  allocations: Allocation[],
  project: Project,
  projects: Project[],
): boolean {
  const relevantProjectIds = new Set(
    project.subteamId
      ? getProjectsInSubteam(project, projects, project.subteamId).map((candidate) => candidate.id)
      : [project.id],
  );
  return allocations.some(
    (allocation) =>
      allocation.projectId !== null
      && relevantProjectIds.has(allocation.projectId)
      && allocation.role === 'DRI'
      && isActiveAllocation(allocation),
  );
}

function getAllocationStartDate(quarter: Cycle | null, today: string): string {
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

function getAllocationUniquenessKey(allocation: Pick<Allocation, 'cycleId' | 'personId' | 'projectId' | 'role' | 'endDate'>): string {
  return `${allocation.cycleId ?? ''}::${allocation.personId}::${allocation.projectId ?? ''}::${allocation.role}::${allocation.endDate ?? 'active'}`;
}

function filterNewAllocationInserts(
  existingAllocations: Allocation[],
  requestedAllocations: Allocation[],
): Allocation[] {
  const seenKeys = new Set(existingAllocations.map(getAllocationUniquenessKey));
  return requestedAllocations.filter((allocation) => {
    const key = getAllocationUniquenessKey(allocation);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

function buildAllocation(params: {
  createId: () => string;
  existingAllocation?: Allocation | null;
  personId: string;
  projectId: string;
  quarter: Cycle | null;
  role: Role;
  percentage: number;
  startDate: string;
}): Allocation {
  const { createId, existingAllocation, personId, projectId, quarter, role, percentage, startDate } = params;
  return {
    id: createId(),
    cycleId: existingAllocation?.cycleId ?? quarter?.id ?? null,
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
  quarter: Cycle | null;
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
  quarter: Cycle | null;
  today?: string;
}): SubteamAllocationPropagationPlan {
  const { allocations, createId, personId, percentage = 0, project, projects, quarter } = params;
  const today = params.today ?? todayDate();
  const ensuredSubteam = planEnsureProjectSubteam(project, createId, `${today}T00:00:00.000Z`);
  const subteamProjects = getProjectsInSubteam(project, projects, ensuredSubteam.subteamId);
  const startDate = getAllocationStartDate(quarter, today);
  const allocationsToUpsert: Allocation[] = [];
  const subteamProjectIds = new Set(subteamProjects.map((candidate) => candidate.id));
  const currentSubteamDriRows = allocations.filter(
    (allocation) =>
      allocation.projectId !== null
      && subteamProjectIds.has(allocation.projectId)
      && allocation.role === 'DRI'
      && allocation.personId !== personId
      && isActiveAllocation(allocation),
  );

  for (const currentDri of currentSubteamDriRows) {
    const currentProjectId = currentDri.projectId;
    if (!currentProjectId) continue;
    allocationsToUpsert.push(endAllocation(currentDri, today));
    const replacementExists = allocations.some(
      (allocation) => allocation.projectId === currentProjectId
        && allocation.personId === currentDri.personId
        && allocation.role === 'Engineer'
        && isActiveAllocation(allocation),
    ) || allocationsToUpsert.some(
      (allocation) => allocation.projectId === currentProjectId
        && allocation.personId === currentDri.personId
        && allocation.role === 'Engineer'
        && isActiveAllocation(allocation),
    );
    if (!replacementExists) {
      allocationsToUpsert.push(buildAllocation({
        createId,
        existingAllocation: currentDri,
        personId: currentDri.personId,
        projectId: currentProjectId,
        quarter,
        role: 'Engineer',
        percentage: currentDri.percentage,
        startDate,
      }));
    }
  }

  for (const subteamProject of subteamProjects) {
    const existing = getActiveProjectPersonAllocation(allocations, subteamProject.id, personId);
    const desiredPercentage = subteamProject.id === project.id ? percentage : 0;

    if (existing) {
      if (existing.role === 'DRI') continue;
      allocationsToUpsert.push(endAllocation(existing, today));
      allocationsToUpsert.push(buildAllocation({
        createId,
        existingAllocation: existing,
        personId,
        projectId: subteamProject.id,
        quarter,
        role: 'DRI',
        percentage: desiredPercentage,
        startDate,
      }));
      continue;
    }

    allocationsToUpsert.push(buildAllocation({
      createId,
      personId,
      projectId: subteamProject.id,
      quarter,
      role: 'DRI',
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
  quarter: Cycle | null;
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
  const hasSiblingDri = activeSiblingAllocations.some((allocation) => allocation.role === 'DRI');
  if (!hasSiblingDri) return [];
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
    const siblingAllocs = rosterByPersonId.get(personId)!;
    const role: Role = siblingAllocs.some((allocation) => allocation.role === 'DRI') ? 'DRI' : 'Engineer';
    allocationsToCreate.push(buildAllocation({
      createId,
      personId,
      projectId: project.id,
      quarter,
      role,
      percentage: 0,
      startDate,
    }));
  }

  return allocationsToCreate;
}

export async function getProjectPageData(projectId: string) {
  const [project, projects, people, subteams, quarters, allocations, cyclePeople, cycleProjects] = await Promise.all([
    db.projects.get(projectId),
    db.projects.toArray(),
    db.people.orderBy('name').toArray(),
    db.subteams.toArray(),
    listResolvedCycles(),
    db.allocations.toArray(),
    db.cyclePeople.toArray(),
    db.cycleProjects.where('projectId').equals(projectId).toArray(),
  ]);
  return { project, projects, people, subteams, quarters, allocations, cyclePeople, cycleProjects };
}

export async function getHomePageData() {
  const [people, subteams, projects, quarters, allocations, cyclePeople] = await Promise.all([
    db.people.toArray(),
    db.subteams.toArray(),
    db.projects.where('status').equals('Active').toArray(),
    listResolvedCycles(),
    db.allocations.toArray(),
    db.cyclePeople.toArray(),
  ]);
  return { people, subteams, projects, quarters, allocations, cyclePeople };
}

export async function getProjectsPageData() {
  const [projects, people, allocations, quarters, cyclePeople] = await Promise.all([
    db.projects.orderBy('name').toArray(),
    db.people.toArray(),
    db.allocations.toArray(),
    listResolvedCycles(),
    db.cyclePeople.toArray(),
  ]);
  return { projects, people, allocations, quarters, cyclePeople };
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
    [db.projects, db.allocations, db.cycleProjects, db.subteams, db.people, db.cyclePeople],
    async () => {
      await db.allocations.bulkDelete(
        (await db.allocations.where('projectId').equals(projectId).toArray()).map((row) => row.id),
      );
      await db.cycleProjects.bulkDelete(
        (await db.cycleProjects.where('projectId').equals(projectId).toArray()).map((row) => row.id),
      );

      if (subteamId) {
        const remainingProjects = await db.projects.where('subteamId').equals(subteamId).toArray();
        const shouldDeleteSubteam = remainingProjects.every((project) => project.id === projectId);
        if (shouldDeleteSubteam) {
          const [people, cyclePeople] = await Promise.all([
            db.people.where('subteamId').equals(subteamId).toArray(),
            db.cyclePeople.where('subteamId').equals(subteamId).toArray(),
          ]);

          if (people.length > 0) {
            await db.people.bulkPut(people.map((person) => ({ ...person, subteamId: null })));
          }
          if (cyclePeople.length > 0) {
            await db.cyclePeople.bulkPut(cyclePeople.map((entry) => ({ ...entry, subteamId: null })));
          }

          await db.subteams.delete(subteamId);
        }
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

export async function updateProjectSubteam(projectId: string, subteamId: string) {
  const [project, projects, allocations, quarters] = await Promise.all([
    db.projects.get(projectId),
    db.projects.toArray(),
    db.allocations.toArray(),
    listResolvedCycles(),
  ]);
  if (!project) return;

  const activeCycle = quarters.find((q) => q.status === 'active') ?? null;
  const patchedProject = { ...project, subteamId };

  const newAllocations = planSyncProjectToSubteamRoster({
    allocations,
    createId: uid,
    project: patchedProject,
    projects,
    quarter: activeCycle,
  });
  const allocationsToCreate = filterNewAllocationInserts(allocations, newAllocations);

  await db.transaction('rw', [db.projects, db.allocations], async () => {
    await db.projects.update(projectId, { subteamId });
    if (allocationsToCreate.length > 0) await db.allocations.bulkAdd(allocationsToCreate);
  });
}

export async function addProjectMember(params: {
  activeCycle: Cycle | null;
  allocations: Awaited<ReturnType<typeof getProjectPageData>>['allocations'];
  personId: string;
  people: Awaited<ReturnType<typeof getProjectPageData>>['people'];
  percentage: number;
  project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>;
  projects: Awaited<ReturnType<typeof getProjectPageData>>['projects'];
  cyclePeople: Awaited<ReturnType<typeof getProjectPageData>>['cyclePeople'];
  role: Role;
}) {
  const { activeCycle, allocations, personId, people, percentage, project, projects, cyclePeople, role } = params;
  const person = people.find((entry) => entry.id === personId);
  const cyclePerson = activeCycle
    ? cyclePeople.find((entry) => entry.personId === personId && entry.cycleId === activeCycle.id)
    : undefined;
  const clampedPercentage = person && personTracksCapacity(role)
    ? clampProjectAllocationPercentage({
      person,
      projectId: project.id,
      cyclePerson,
      cycleId: activeCycle?.id ?? null,
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
      quarter: activeCycle,
    });
    await db.transaction('rw', [db.subteams, db.projects, db.allocations], async () => {
      if (plan.subteamToCreate) await db.subteams.add(plan.subteamToCreate);
      if (plan.projectPatch) await db.projects.update(project.id, plan.projectPatch);
      if (plan.allocationsToUpsert.length > 0) await db.allocations.bulkPut(plan.allocationsToUpsert);
    });
    return;
  }

  if (role === 'Engineer') {
    if (!hasActiveDriForProjectSubteam(allocations, project, projects)) return;
    const plan = planAddPersonToProjectSubteam({
      allocations,
      createId: uid,
      personId,
      percentage: clampedPercentage,
      project,
      projects,
      quarter: activeCycle,
      role: 'Engineer',
    });
    await db.transaction('rw', [db.subteams, db.projects, db.allocations], async () => {
      if (plan.subteamToCreate) await db.subteams.add(plan.subteamToCreate);
      if (plan.projectPatch) await db.projects.update(project.id, plan.projectPatch);
      if (plan.allocationsToUpsert.length > 0) await db.allocations.bulkPut(plan.allocationsToUpsert);
    });
    return;
  }

  const allocationToAdd: Allocation = {
    id: uid(),
    cycleId: activeCycle?.id ?? null,
    projectId: project.id,
    personId,
    role,
    startDate: activeCycle?.startDate ?? todayDate(),
    endDate: null,
    percentage: 0,
  };
  if (filterNewAllocationInserts(allocations, [allocationToAdd]).length === 0) return;
  await db.allocations.add(allocationToAdd);
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
  activeCycle: Cycle;
  description: string;
  project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>;
  title: string;
}) {
  const { activeCycle, description, project, title } = params;
  await db.projects.update(project.id, {
    unknowns: [
      ...project.unknowns,
      {
        id: uid(),
        cycleId: activeCycle.id,
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
  activeCycle: Cycle;
  impact: RiskImpact;
  likelihood: RiskLikelihood;
  mitigationNote: string;
  project: NonNullable<Awaited<ReturnType<typeof getProjectPageData>>['project']>;
  title: string;
}) {
  const { activeCycle, impact, likelihood, mitigationNote, project, title } = params;
  await db.projects.update(project.id, {
    risks: [
      ...project.risks,
      {
        id: uid(),
        cycleId: activeCycle.id,
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
  const cycleId = activeDeliveryAllocations[0]?.cycleId ?? null;
  const cyclePerson = cycleId
    ? await db.cyclePeople.where({ cycleId, personId }).first()
    : undefined;
  const clamped = clampProjectAllocationPercentage({
    person,
    projectId,
    cyclePerson,
    cycleId,
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
  cycleId?: string | null;
  cyclePeople?: Awaited<ReturnType<typeof getProjectPageData>>['cyclePeople'];
}) {
  const { allocations, person, projectId, cycleId, cyclePeople = [] } = params;
  const cyclePerson = cycleId
    ? cyclePeople.find((entry) => entry.personId === person.id && entry.cycleId === cycleId)
    : undefined;
  return getMaxProjectAllocationPercentage({
    person,
    projectId,
    cyclePerson,
    cycleId,
    allocations,
  });
}
