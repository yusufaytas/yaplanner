import type { Person } from './types';

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
