import { listResolvedQuarters } from './quarters';
import { db } from './db';
import type { Allocation, Person, Role } from './types';

export function splitLeadershipPeople<T extends Pick<Person, 'role'>>(people: T[]): {
  ems: T[];
  pms: T[];
} {
  return {
    ems: people.filter((person) => person.role === 'EM'),
    pms: people.filter((person) => person.role === 'PM'),
  };
}

export function resolveCreatedPersonSubteamId(role: string, subteamId: string): string | null {
  return role === 'Engineer' ? subteamId || null : null;
}

function getPersonNameParts(name: string): { firstName: string; surname: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    surname: parts.length > 1 ? parts[parts.length - 1] : null,
  };
}

export function getProjectCardPersonName(
  person: Pick<Person, 'id' | 'name'>,
  visiblePeople: Array<Pick<Person, 'id' | 'name'> | null | undefined>,
): string {
  const { firstName, surname } = getPersonNameParts(person.name);
  if (!firstName) return person.name;

  const matchingFirstNames = visiblePeople.filter((candidate) => {
    if (!candidate) return false;
    return getPersonNameParts(candidate.name).firstName.toLowerCase() === firstName.toLowerCase();
  });

  if (matchingFirstNames.length <= 1) return firstName;
  if (!surname) return person.name;
  return `${firstName} ${surname}`;
}

// ── db queries & mutations ────────────────────────────────────────────────────

export async function getPeoplePageData() {
  const [people, subteams] = await Promise.all([
    db.people.orderBy('name').toArray(),
    db.subteams.orderBy('name').toArray(),
  ]);
  return { people, subteams };
}

export async function getPersonPageData(personId: string) {
  const [person, subteams, allocations, projects, quarters, quarterPeople] = await Promise.all([
    db.people.get(personId),
    db.subteams.orderBy('name').toArray(),
    db.allocations.where('personId').equals(personId).toArray(),
    db.projects.toArray(),
    listResolvedQuarters(),
    db.quarterPeople.where('personId').equals(personId).toArray(),
  ]);
  return { person, subteams, allocations, projects, quarters, quarterPeople };
}

export async function createPerson(params: {
  id: string;
  name: string;
  role: Role;
  subteamId: string;
}) {
  const { id, name, role, subteamId } = params;
  await db.people.add({
    id,
    name: name.trim(),
    email: null,
    role,
    defaultCapacity: 100,
    subteamId: resolveCreatedPersonSubteamId(role, subteamId),
    notes: '',
    createdAt: new Date().toISOString(),
  });
}

export async function deletePerson(personId: string) {
  await db.people.delete(personId);
}

export async function updatePerson(personId: string, patch: Partial<Person>) {
  await db.people.update(personId, patch);
}

// keep Allocation in scope for callers that need it via this module
export type { Allocation };
