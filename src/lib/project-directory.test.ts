import { describe, expect, it } from 'vitest';
import { buildProjectLeadershipMaps, splitProjectsByStatus } from './project-directory';
import type { Allocation, Project } from './types';

function makeProject(overrides: Partial<Project> & Pick<Project, 'id' | 'status'>): Project {
  return {
    name: overrides.id,
    description: '',
    tags: [],
    subteamId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    links: [],
    unknowns: [],
    risks: [],
    ...overrides,
  };
}

function makeAllocation(
  overrides: Partial<Allocation> & Pick<Allocation, 'id' | 'personId' | 'projectId' | 'role'>,
): Allocation {
  return {
    cycleId: 'q1',
    startDate: '2026-04-01',
    endDate: null,
    percentage: 0,
    ...overrides,
  };
}

describe('splitProjectsByStatus', () => {
  it('puts Proposed, Active, and On Hold into activeProjects', () => {
    const projects = [
      makeProject({ id: 'p1', status: 'Proposed' }),
      makeProject({ id: 'p2', status: 'Active' }),
      makeProject({ id: 'p3', status: 'On Hold' }),
    ];
    const { activeProjects, archivedProjects } = splitProjectsByStatus(projects);
    expect(activeProjects.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(archivedProjects).toHaveLength(0);
  });

  it('puts Complete and Cancelled into archivedProjects', () => {
    const projects = [
      makeProject({ id: 'p1', status: 'Complete' }),
      makeProject({ id: 'p2', status: 'Cancelled' }),
    ];
    const { activeProjects, archivedProjects } = splitProjectsByStatus(projects);
    expect(activeProjects).toHaveLength(0);
    expect(archivedProjects.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('splits a mixed list correctly', () => {
    const projects = [
      makeProject({ id: 'p1', status: 'Active' }),
      makeProject({ id: 'p2', status: 'Complete' }),
      makeProject({ id: 'p3', status: 'Proposed' }),
      makeProject({ id: 'p4', status: 'Cancelled' }),
    ];
    const { activeProjects, archivedProjects } = splitProjectsByStatus(projects);
    expect(activeProjects.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(archivedProjects.map((p) => p.id)).toEqual(['p2', 'p4']);
  });

  it('returns empty arrays for an empty input', () => {
    const { activeProjects, archivedProjects } = splitProjectsByStatus([]);
    expect(activeProjects).toHaveLength(0);
    expect(archivedProjects).toHaveLength(0);
  });
});

describe('buildProjectLeadershipMaps', () => {
  const projects = [
    makeProject({ id: 'p1', status: 'Active' }),
    makeProject({ id: 'p2', status: 'Active' }),
  ];

  it('maps DRI, EM, and PM to their respective projects', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'person-dri', projectId: 'p1', role: 'DRI' }),
      makeAllocation({ id: 'a2', personId: 'person-em', projectId: 'p1', role: 'EM' }),
      makeAllocation({ id: 'a3', personId: 'person-pm', projectId: 'p1', role: 'PM' }),
    ];
    const { driByProject, emByProject, pmByProject } = buildProjectLeadershipMaps(projects, allocations, null);
    expect(driByProject.get('p1')).toBe('person-dri');
    expect(emByProject.get('p1')).toBe('person-em');
    expect(pmByProject.get('p1')).toBe('person-pm');
  });

  it('excludes ended allocations', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'person-dri', projectId: 'p1', role: 'DRI', endDate: '2026-03-01' }),
    ];
    const { driByProject } = buildProjectLeadershipMaps(projects, allocations, null);
    expect(driByProject.has('p1')).toBe(false);
  });

  it('filters by activeCycleId when provided', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'person-dri', projectId: 'p1', role: 'DRI', cycleId: 'q1' }),
      makeAllocation({ id: 'a2', personId: 'person-dri-2', projectId: 'p1', role: 'DRI', cycleId: 'q2' }),
    ];
    const { driByProject } = buildProjectLeadershipMaps(projects, allocations, 'q1');
    expect(driByProject.get('p1')).toBe('person-dri');
  });

  it('returns empty maps when there are no allocations', () => {
    const { driByProject, emByProject, pmByProject } = buildProjectLeadershipMaps(projects, [], null);
    expect(driByProject.size).toBe(0);
    expect(emByProject.size).toBe(0);
    expect(pmByProject.size).toBe(0);
  });

  it('does not map Engineer or Stakeholder roles into leadership maps', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'p1', role: 'Engineer' }),
      makeAllocation({ id: 'a2', personId: 'stake-1', projectId: 'p1', role: 'Stakeholder' }),
    ];
    const { driByProject, emByProject, pmByProject } = buildProjectLeadershipMaps(projects, allocations, null);
    expect(driByProject.has('p1')).toBe(false);
    expect(emByProject.has('p1')).toBe(false);
    expect(pmByProject.has('p1')).toBe(false);
  });
});
