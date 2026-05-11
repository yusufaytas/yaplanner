import type { Project, QuarterProject } from './types';

export function sortQuarterProjects(quarterProjects: QuarterProject[]): QuarterProject[] {
  return [...quarterProjects].sort((a, b) => {
    if (a.priority === null && b.priority === null) return 0;
    if (a.priority === null) return 1;
    if (b.priority === null) return -1;
    return a.priority - b.priority;
  });
}

export function getAddableProjects(projects: Project[], quarterProjects: QuarterProject[]): Project[] {
  const assignedProjectIds = new Set(quarterProjects.map((quarterProject) => quarterProject.projectId));
  return projects
    .filter(
      (project) =>
        !assignedProjectIds.has(project.id) &&
        project.status !== 'Complete' &&
        project.status !== 'Cancelled',
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getAutoCapacityLineAfter(
  quarterProjects: QuarterProject[],
  totalAvailablePersonWeeks: number | null,
): number {
  if (totalAvailablePersonWeeks === null) return -1;

  let cumulativeEstimatedPersonWeeks = 0;
  for (let i = 0; i < quarterProjects.length; i++) {
    cumulativeEstimatedPersonWeeks += quarterProjects[i].estimatedPersonWeeks ?? 0;
    if (cumulativeEstimatedPersonWeeks >= totalAvailablePersonWeeks) {
      return i;
    }
  }

  return -1;
}
