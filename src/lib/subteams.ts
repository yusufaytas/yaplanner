import { db } from './db';
import { listResolvedCycles } from './cycles';
import type { Allocation, Person, Project } from './types';

function isSubteamDeliveryAllocation(allocation: Allocation): boolean {
  return allocation.role === 'DRI' || allocation.role === 'Engineer';
}

export function getSubteamActiveAllocations(
  projects: Project[],
  allocations: Allocation[],
  subteamId: string,
): Allocation[] {
  const projectIds = new Set(
    projects.filter((project) => project.subteamId === subteamId).map((project) => project.id),
  );
  return allocations.filter(
    (allocation) =>
      allocation.projectId !== null &&
      projectIds.has(allocation.projectId) &&
      allocation.endDate === null &&
      isSubteamDeliveryAllocation(allocation),
  );
}

export function getSubteamPeople(people: Person[], allocations: Allocation[]): Person[] {
  const personIds = new Set(allocations.map((allocation) => allocation.personId));
  return people.filter((person) => personIds.has(person.id));
}

export function getSubteamProjectCollections(
  projects: Project[],
  allocations: Allocation[],
  subteamId: string,
): { ownedProjects: Project[]; contributingProjects: Project[] } {
  const ownedProjects = projects.filter((project) => project.subteamId === subteamId);
  const ownedProjectIds = new Set(ownedProjects.map((project) => project.id));
  const contributingProjectIds = new Set(
    allocations
      .filter(
        (allocation) =>
          allocation.endDate === null &&
          allocation.projectId &&
          !ownedProjectIds.has(allocation.projectId) &&
          isSubteamDeliveryAllocation(allocation),
      )
      .map((allocation) => allocation.projectId as string),
  );
  return {
    ownedProjects,
    contributingProjects: projects.filter((project) => contributingProjectIds.has(project.id)),
  };
}

export function getSubteamMemberCountBySubteam(
  projects: Project[],
  allocations: Allocation[],
): Map<string, number> {
  const counts = new Map<string, Set<string>>();
  for (const allocation of allocations) {
    if (
      allocation.endDate !== null ||
      !allocation.projectId ||
      !isSubteamDeliveryAllocation(allocation)
    )
      continue;
    const project = projects.find((candidate) => candidate.id === allocation.projectId);
    if (!project?.subteamId) continue;
    const set = counts.get(project.subteamId) ?? new Set<string>();
    set.add(allocation.personId);
    counts.set(project.subteamId, set);
  }
  return new Map(Array.from(counts.entries()).map(([key, value]) => [key, value.size]));
}


// ── db queries & mutations ────────────────────────────────────────────────────

export async function getSubteamsPageData() {
  const [subteams, people, projects, allocations] = await Promise.all([
    db.subteams.orderBy('name').toArray(),
    db.people.toArray(),
    db.projects.toArray(),
    db.allocations.toArray(),
  ]);
  return { subteams, people, projects, allocations };
}

export async function getSubteamPageData(subteamId: string) {
  const [subteam, people, quarters, projects, allocations, cyclePeople] = await Promise.all([
    db.subteams.get(subteamId),
    db.people.orderBy('name').toArray(),
    listResolvedCycles(),
    db.projects.toArray(),
    db.allocations.toArray(),
    db.cyclePeople.toArray(),
  ]);
  return { subteam, people, quarters, projects, allocations, cyclePeople };
}

export async function createSubteam(params: { id: string; name: string; purpose: string | null }) {
  const { id, name, purpose } = params;
  await db.subteams.add({
    id,
    name: name.trim(),
    purpose,
    createdAt: new Date().toISOString(),
  });
}

export async function deleteSubteam(subteamId: string) {
  await db.transaction('rw', [db.subteams, db.projects, db.people, db.cyclePeople], async () => {
    const [projects, people, cyclePeople] = await Promise.all([
      db.projects.where('subteamId').equals(subteamId).toArray(),
      db.people.where('subteamId').equals(subteamId).toArray(),
      db.cyclePeople.where('subteamId').equals(subteamId).toArray(),
    ]);

    if (projects.length > 0) {
      throw new Error('Cannot delete a subteam that still owns projects.');
    }

    if (people.length > 0) {
      await db.people.bulkPut(
        people.map((person) => ({ ...person, subteamId: null })),
      );
    }

    if (cyclePeople.length > 0) {
      await db.cyclePeople.bulkPut(
        cyclePeople.map((person) => ({ ...person, subteamId: null })),
      );
    }

    await db.subteams.delete(subteamId);
  });
}

export async function updateSubteam(
  subteamId: string,
  patch: { name?: string; purpose?: string | null },
) {
  await db.subteams.update(subteamId, patch);
}
