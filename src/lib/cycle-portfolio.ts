import type { Project, CycleProject } from './types';

export function sortCycleProjects(cycleProjects: CycleProject[]): CycleProject[] {
  return [...cycleProjects].sort((a, b) => {
    if (a.priority === null && b.priority === null) return 0;
    if (a.priority === null) return 1;
    if (b.priority === null) return -1;
    return a.priority - b.priority;
  });
}

export function getAddableProjects(projects: Project[], cycleProjects: CycleProject[]): Project[] {
  const assignedProjectIds = new Set(cycleProjects.map((cycleProject) => cycleProject.projectId));
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
  cycleProjects: CycleProject[],
  totalAvailablePersonWeeks: number | null,
): number {
  if (totalAvailablePersonWeeks === null || cycleProjects.length === 0) return -1;

  let cumulativeEstimatedPersonWeeks = 0;
  for (let i = 0; i < cycleProjects.length; i++) {
    cumulativeEstimatedPersonWeeks += cycleProjects[i].estimatedPersonWeeks ?? 0;
    if (cumulativeEstimatedPersonWeeks > totalAvailablePersonWeeks) {
      // Line goes after the last project that still fit (before this one)
      return i - 1;
    }
  }

  // All projects fit within capacity — line goes after the last project
  return cycleProjects.length - 1;
}
