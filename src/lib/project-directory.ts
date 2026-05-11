import type { Allocation, Project, ProjectStatus } from './types';

const ACTIVE_PROJECT_STATUSES = new Set<ProjectStatus>(['Proposed', 'Active', 'On Hold']);
const ARCHIVED_PROJECT_STATUSES = new Set<ProjectStatus>(['Complete', 'Cancelled']);

export interface ProjectLeadershipMaps {
  driByProject: Map<string, string>;
  emByProject: Map<string, string>;
  pmByProject: Map<string, string>;
}

function isActiveAllocation(allocation: Allocation, activeQuarterId: string | null): boolean {
  if (activeQuarterId !== null && allocation.quarterId !== activeQuarterId) return false;
  return allocation.endDate === null;
}

export function buildProjectLeadershipMaps(
  projects: Project[],
  allocations: Allocation[],
  activeQuarterId: string | null,
): ProjectLeadershipMaps {
  const driByProject = new Map<string, string>();
  const emByProject = new Map<string, string>();
  const pmByProject = new Map<string, string>();

  for (const project of projects) {
    const projectAllocations = allocations.filter(
      (allocation) => allocation.projectId === project.id && isActiveAllocation(allocation, activeQuarterId),
    );
    const dri = projectAllocations.find((allocation) => allocation.role === 'DRI');
    const em = projectAllocations.find((allocation) => allocation.role === 'EM');
    const pm = projectAllocations.find((allocation) => allocation.role === 'PM');
    if (dri) driByProject.set(project.id, dri.personId);
    if (em) emByProject.set(project.id, em.personId);
    if (pm) pmByProject.set(project.id, pm.personId);
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
