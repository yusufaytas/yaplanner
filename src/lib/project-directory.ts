import type { Project, ProjectRole, ProjectStatus } from './types';

const ACTIVE_PROJECT_STATUSES = new Set<ProjectStatus>(['Proposed', 'Active', 'On Hold']);
const ARCHIVED_PROJECT_STATUSES = new Set<ProjectStatus>(['Complete', 'Cancelled']);

export interface ProjectLeadershipMaps {
  driByProject: Map<string, string>;
  emByProject: Map<string, string>;
  pmByProject: Map<string, string>;
}

export function buildProjectLeadershipMaps(
  projectRoles: ProjectRole[],
  activeQuarterId: string | null,
): ProjectLeadershipMaps {
  const driByProject = new Map<string, string>();
  const emByProject = new Map<string, string>();
  const pmByProject = new Map<string, string>();

  for (const role of projectRoles) {
    if (activeQuarterId && role.quarterId !== activeQuarterId) continue;
    if (role.role === 'DRI' && !driByProject.has(role.projectId)) {
      driByProject.set(role.projectId, role.personId);
    }
    if (role.role === 'EM' && !emByProject.has(role.projectId)) {
      emByProject.set(role.projectId, role.personId);
    }
    if (role.role === 'PM' && !pmByProject.has(role.projectId)) {
      pmByProject.set(role.projectId, role.personId);
    }
  }

  return { driByProject, emByProject, pmByProject };
}

export function splitProjectsByStatus<T extends Pick<Project, 'status'>>(projects: T[]): {
  activeProjects: T[];
  archivedProjects: T[];
} {
  return {
    activeProjects: projects.filter((project) => ACTIVE_PROJECT_STATUSES.has(project.status)),
    archivedProjects: projects.filter((project) => ARCHIVED_PROJECT_STATUSES.has(project.status)),
  };
}
