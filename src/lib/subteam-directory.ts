import type { Person, Project, ProjectRole } from './types';

export interface SubteamMemberCollections {
  engineerMembers: Person[];
  engineers: Person[];
  nonMembers: Person[];
  memberIds: Set<string>;
}

export function getSubteamMemberCollections(
  allPeople: Person[],
  subteamId: string,
): SubteamMemberCollections {
  const engineers = allPeople.filter((person) => person.role === 'Engineer');
  const engineerMembers = engineers.filter((person) => person.subteamId === subteamId);
  const memberIds = new Set(engineerMembers.map((member) => member.id));
  const nonMembers = engineers.filter((person) => person.subteamId !== subteamId);

  return { engineerMembers, engineers, nonMembers, memberIds };
}

export function getSubteamProjectCollections(
  projects: Project[],
  projectRoles: ProjectRole[],
  activeQuarterId: string | null,
  memberIds: Set<string>,
  subteamId: string,
): {
  ownedProjects: Project[];
  contributingProjects: Project[];
} {
  const ownedProjects = projects.filter((project) => project.owningSubteamId === subteamId);
  if (!activeQuarterId) {
    return { ownedProjects, contributingProjects: [] };
  }

  const ownedProjectIds = new Set(ownedProjects.map((project) => project.id));
  const contributingProjectIds = new Set(
    projectRoles
      .filter((role) => role.quarterId === activeQuarterId && memberIds.has(role.personId))
      .map((role) => role.projectId),
  );
  const contributingProjects = Array.from(contributingProjectIds)
    .filter((projectId) => !ownedProjectIds.has(projectId))
    .map((projectId) => projects.find((project) => project.id === projectId))
    .filter((project): project is Project => Boolean(project));

  return { ownedProjects, contributingProjects };
}

export function getSubteamMemberCountBySubteam(people: Person[]): Map<string, number> {
  const memberCountBySubteam = new Map<string, number>();
  for (const person of people) {
    if (person.role !== 'Engineer' || !person.subteamId) continue;
    memberCountBySubteam.set(person.subteamId, (memberCountBySubteam.get(person.subteamId) ?? 0) + 1);
  }
  return memberCountBySubteam;
}
