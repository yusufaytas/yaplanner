import { describe, expect, it } from 'vitest';
import {
  getAddableProjects,
  getAutoCapacityLineAfter,
  sortQuarterProjects,
} from './quarter-portfolio';
import type { Project, QuarterProject } from './types';

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

function makeQuarterProject(overrides: Partial<QuarterProject> & Pick<QuarterProject, 'id' | 'projectId'>): QuarterProject {
  return {
    quarterId: 'q1',
    status: 'Active',
    priority: null,
    estimatedPersonWeeks: null,
    notes: '',
    plannedStartWeek: null,
    plannedEndWeek: null,
    targetMilestone: null,
    ...overrides,
  };
}

describe('sortQuarterProjects', () => {
  it('sorts by priority ascending', () => {
    const qps = [
      makeQuarterProject({ id: 'qp3', projectId: 'p3', priority: 2 }),
      makeQuarterProject({ id: 'qp1', projectId: 'p1', priority: 0 }),
      makeQuarterProject({ id: 'qp2', projectId: 'p2', priority: 1 }),
    ];
    const sorted = sortQuarterProjects(qps);
    expect(sorted.map((qp) => qp.id)).toEqual(['qp1', 'qp2', 'qp3']);
  });

  it('puts null-priority items at the end', () => {
    const qps = [
      makeQuarterProject({ id: 'qp-null', projectId: 'p-null', priority: null }),
      makeQuarterProject({ id: 'qp1', projectId: 'p1', priority: 0 }),
    ];
    const sorted = sortQuarterProjects(qps);
    expect(sorted.map((qp) => qp.id)).toEqual(['qp1', 'qp-null']);
  });

  it('keeps two null-priority items in stable relative order', () => {
    const qps = [
      makeQuarterProject({ id: 'qp-a', projectId: 'pa', priority: null }),
      makeQuarterProject({ id: 'qp-b', projectId: 'pb', priority: null }),
    ];
    const sorted = sortQuarterProjects(qps);
    expect(sorted.map((qp) => qp.id)).toEqual(['qp-a', 'qp-b']);
  });

  it('does not mutate the original array', () => {
    const qps = [
      makeQuarterProject({ id: 'qp2', projectId: 'p2', priority: 1 }),
      makeQuarterProject({ id: 'qp1', projectId: 'p1', priority: 0 }),
    ];
    const original = [...qps];
    sortQuarterProjects(qps);
    expect(qps.map((qp) => qp.id)).toEqual(original.map((qp) => qp.id));
  });

  it('returns an empty array for empty input', () => {
    expect(sortQuarterProjects([])).toEqual([]);
  });
});

describe('getAddableProjects', () => {
  it('excludes projects already in the quarter', () => {
    const projects = [
      makeProject({ id: 'p1', status: 'Active' }),
      makeProject({ id: 'p2', status: 'Active' }),
    ];
    const quarterProjects = [makeQuarterProject({ id: 'qp1', projectId: 'p1' })];
    const addable = getAddableProjects(projects, quarterProjects);
    expect(addable.map((p) => p.id)).toEqual(['p2']);
  });

  it('excludes Complete and Cancelled projects', () => {
    const projects = [
      makeProject({ id: 'p1', status: 'Active' }),
      makeProject({ id: 'p2', status: 'Complete' }),
      makeProject({ id: 'p3', status: 'Cancelled' }),
      makeProject({ id: 'p4', status: 'Proposed' }),
    ];
    const addable = getAddableProjects(projects, []);
    expect(addable.map((p) => p.id)).toEqual(['p1', 'p4']);
  });

  it('returns projects sorted alphabetically by name', () => {
    const projects = [
      makeProject({ id: 'p1', name: 'Zebra', status: 'Active' }),
      makeProject({ id: 'p2', name: 'Alpha', status: 'Active' }),
      makeProject({ id: 'p3', name: 'Mango', status: 'Active' }),
    ];
    const addable = getAddableProjects(projects, []);
    expect(addable.map((p) => p.name)).toEqual(['Alpha', 'Mango', 'Zebra']);
  });

  it('returns all non-archived projects when the quarter is empty', () => {
    const projects = [
      makeProject({ id: 'p1', status: 'Active' }),
      makeProject({ id: 'p2', status: 'On Hold' }),
    ];
    expect(getAddableProjects(projects, [])).toHaveLength(2);
  });

  it('returns an empty array when all projects are already added or archived', () => {
    const projects = [
      makeProject({ id: 'p1', status: 'Active' }),
      makeProject({ id: 'p2', status: 'Complete' }),
    ];
    const quarterProjects = [makeQuarterProject({ id: 'qp1', projectId: 'p1' })];
    expect(getAddableProjects(projects, quarterProjects)).toHaveLength(0);
  });
});

describe('getAutoCapacityLineAfter', () => {
  it('returns -1 when totalAvailablePersonWeeks is null', () => {
    const qps = [makeQuarterProject({ id: 'qp1', projectId: 'p1', estimatedPersonWeeks: 5 })];
    expect(getAutoCapacityLineAfter(qps, null)).toBe(-1);
  });

  it('returns the index where cumulative estimate first meets or exceeds capacity', () => {
    const qps = [
      makeQuarterProject({ id: 'qp1', projectId: 'p1', estimatedPersonWeeks: 3 }),
      makeQuarterProject({ id: 'qp2', projectId: 'p2', estimatedPersonWeeks: 4 }),
      makeQuarterProject({ id: 'qp3', projectId: 'p3', estimatedPersonWeeks: 5 }),
    ];
    // 3 < 6, 3+4=7 >= 6 → line after index 1
    expect(getAutoCapacityLineAfter(qps, 6)).toBe(1);
  });

  it('returns -1 when total estimate never reaches capacity', () => {
    const qps = [
      makeQuarterProject({ id: 'qp1', projectId: 'p1', estimatedPersonWeeks: 2 }),
      makeQuarterProject({ id: 'qp2', projectId: 'p2', estimatedPersonWeeks: 2 }),
    ];
    expect(getAutoCapacityLineAfter(qps, 10)).toBe(-1);
  });

  it('treats null estimatedPersonWeeks as 0', () => {
    const qps = [
      makeQuarterProject({ id: 'qp1', projectId: 'p1', estimatedPersonWeeks: null }),
      makeQuarterProject({ id: 'qp2', projectId: 'p2', estimatedPersonWeeks: 5 }),
    ];
    // 0 < 4, 0+5=5 >= 4 → line after index 1
    expect(getAutoCapacityLineAfter(qps, 4)).toBe(1);
  });

  it('returns 0 when the first project alone meets capacity', () => {
    const qps = [
      makeQuarterProject({ id: 'qp1', projectId: 'p1', estimatedPersonWeeks: 10 }),
      makeQuarterProject({ id: 'qp2', projectId: 'p2', estimatedPersonWeeks: 5 }),
    ];
    expect(getAutoCapacityLineAfter(qps, 8)).toBe(0);
  });

  it('returns -1 for an empty project list', () => {
    expect(getAutoCapacityLineAfter([], 10)).toBe(-1);
  });
});
