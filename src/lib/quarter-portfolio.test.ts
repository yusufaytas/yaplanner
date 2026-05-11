import { describe, expect, it } from 'vitest';
import { getAddableProjects, getAutoCapacityLineAfter, sortQuarterProjects } from './quarter-portfolio';
import type { Project, QuarterProject } from './types';

describe('quarter portfolio helpers', () => {
  it('sorts quarter projects by priority with nulls last', () => {
    const quarterProjects: QuarterProject[] = [
      {
        id: 'qp-3',
        quarterId: 'q1',
        projectId: 'p3',
        status: 'Active',
        priority: null,
        estimatedPersonWeeks: null,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
      {
        id: 'qp-2',
        quarterId: 'q1',
        projectId: 'p2',
        status: 'Active',
        priority: 2,
        estimatedPersonWeeks: null,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
      {
        id: 'qp-1',
        quarterId: 'q1',
        projectId: 'p1',
        status: 'Active',
        priority: 0,
        estimatedPersonWeeks: null,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
    ];

    expect(sortQuarterProjects(quarterProjects).map((project) => project.id)).toEqual(['qp-1', 'qp-2', 'qp-3']);
  });

  it('returns addable projects sorted by name and excluding completed, cancelled, and already-assigned projects', () => {
    const projects: Project[] = [
      {
        id: 'p3',
        name: 'Gamma',
        description: '',
        status: 'Cancelled',
        tags: [],
        owningSubteamId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      },
      {
        id: 'p2',
        name: 'Beta',
        description: '',
        status: 'Proposed',
        tags: [],
        owningSubteamId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      },
      {
        id: 'p1',
        name: 'Alpha',
        description: '',
        status: 'Active',
        tags: [],
        owningSubteamId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      },
      {
        id: 'p4',
        name: 'Delta',
        description: '',
        status: 'Complete',
        tags: [],
        owningSubteamId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      },
    ];
    const quarterProjects: QuarterProject[] = [
      {
        id: 'qp-1',
        quarterId: 'q1',
        projectId: 'p2',
        status: 'Proposed',
        priority: 0,
        estimatedPersonWeeks: null,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
    ];

    expect(getAddableProjects(projects, quarterProjects).map((project) => project.id)).toEqual(['p1']);
  });

  it('derives the first capacity-line break from cumulative estimated weeks', () => {
    const quarterProjects: QuarterProject[] = [
      {
        id: 'qp-1',
        quarterId: 'q1',
        projectId: 'p1',
        status: 'Active',
        priority: 0,
        estimatedPersonWeeks: 2,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
      {
        id: 'qp-2',
        quarterId: 'q1',
        projectId: 'p2',
        status: 'Active',
        priority: 1,
        estimatedPersonWeeks: 3,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
      {
        id: 'qp-3',
        quarterId: 'q1',
        projectId: 'p3',
        status: 'Active',
        priority: 2,
        estimatedPersonWeeks: 4,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
    ];

    expect(getAutoCapacityLineAfter(quarterProjects, 5)).toBe(1);
    expect(getAutoCapacityLineAfter(quarterProjects, null)).toBe(-1);
    expect(getAutoCapacityLineAfter(quarterProjects, 20)).toBe(-1);
  });
});
