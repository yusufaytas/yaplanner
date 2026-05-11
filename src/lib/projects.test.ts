import { describe, expect, it } from 'vitest';

import {
  planAddPersonToProjectSubteam,
  planRemovePersonFromProjectSubteam,
  planSetProjectDri,
  planSyncProjectToSubteamRoster,
} from './projects';
import type { Allocation, Project, Quarter } from './types';

const quarter: Quarter = {
  id: 'q1',
  name: '2026-Q2',
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  status: 'active',
  createdAt: '2026-03-01T00:00:00.000Z',
  createdFromQuarterId: null,
  capacityLineAfter: null,
  overhead: { items: [] },
};

const subteamProjectA: Project = {
  id: 'project-a',
  name: 'Project A',
  description: '',
  status: 'Active',
  tags: [],
  subteamId: 'subteam-1',
  createdAt: '2026-03-01T00:00:00.000Z',
  archivedAt: null,
  links: [],
  unknowns: [],
  risks: [],
};

const subteamProjectB: Project = {
  id: 'project-b',
  name: 'Project B',
  description: '',
  status: 'Active',
  tags: [],
  subteamId: 'subteam-1',
  createdAt: '2026-03-01T00:00:00.000Z',
  archivedAt: null,
  links: [],
  unknowns: [],
  risks: [],
};

const nextId = (() => {
  let index = 0;
  return () => `generated-${++index}`;
})();

function makeAllocation(overrides: Partial<Allocation> & Pick<Allocation, 'id' | 'personId' | 'projectId' | 'role'>): Allocation {
  return {
    id: overrides.id,
    quarterId: overrides.quarterId ?? quarter.id,
    personId: overrides.personId,
    projectId: overrides.projectId,
    role: overrides.role,
    startDate: overrides.startDate ?? quarter.startDate,
    endDate: overrides.endDate ?? null,
    percentage: overrides.percentage ?? 0,
  };
}

describe('project team propagation', () => {
  it('adds a person across every sibling project in the subteam', () => {
    const plan = planAddPersonToProjectSubteam({
      allocations: [],
      createId: nextId,
      personId: 'eng-1',
      percentage: 35,
      project: subteamProjectA,
      projects: [subteamProjectA, subteamProjectB],
      quarter,
      role: 'Engineer',
      today: '2026-05-11',
    });

    expect(plan.subteamId).toBe('subteam-1');
    expect(plan.allocationsToUpsert).toHaveLength(2);
    expect(plan.allocationsToUpsert.map((allocation) => ({
      projectId: allocation.projectId,
      role: allocation.role,
      personId: allocation.personId,
      percentage: allocation.percentage,
      startDate: allocation.startDate,
    }))).toEqual([
      { projectId: 'project-a', role: 'Engineer', personId: 'eng-1', percentage: 35, startDate: '2026-05-11' },
      { projectId: 'project-b', role: 'Engineer', personId: 'eng-1', percentage: 0, startDate: '2026-05-11' },
    ]);
  });

  it('keeps PM assignments project-specific', () => {
    const plan = planAddPersonToProjectSubteam({
      allocations: [],
      createId: nextId,
      personId: 'pm-1',
      project: subteamProjectA,
      projects: [subteamProjectA, subteamProjectB],
      quarter,
      role: 'PM',
      today: '2026-05-11',
    });

    expect(plan.allocationsToUpsert).toEqual([
      expect.objectContaining({ projectId: 'project-a', role: 'PM', personId: 'pm-1' }),
    ]);
  });

  it('switches the target project DRI while preserving history and sibling membership', () => {
    const allocations = [
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-old', role: 'DRI', percentage: 40 }),
      makeAllocation({ id: 'a-2', projectId: 'project-a', personId: 'eng-new', role: 'Engineer', percentage: 60 }),
      makeAllocation({ id: 'b-1', projectId: 'project-b', personId: 'eng-old', role: 'Engineer', percentage: 50 }),
    ];

    const plan = planSetProjectDri({
      allocations,
      createId: nextId,
      personId: 'eng-new',
      project: subteamProjectA,
      projects: [subteamProjectA, subteamProjectB],
      quarter,
      today: '2026-05-11',
    });

    expect(plan.allocationsToUpsert).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'a-1', endDate: '2026-05-11', role: 'DRI' }),
      expect.objectContaining({ personId: 'eng-old', projectId: 'project-a', role: 'Engineer', startDate: '2026-05-11', endDate: null }),
      expect.objectContaining({ id: 'a-2', endDate: '2026-05-11', role: 'Engineer' }),
      expect.objectContaining({ personId: 'eng-new', projectId: 'project-a', role: 'DRI', startDate: '2026-05-11', endDate: null }),
      expect.objectContaining({ personId: 'eng-new', projectId: 'project-b', role: 'Engineer', startDate: '2026-05-11', endDate: null }),
    ]));
  });

  it('removes a person across the full subteam, not just one project', () => {
    const allocations = [
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-1', role: 'Engineer', startDate: '2026-01-01' }),
      makeAllocation({ id: 'b-1', projectId: 'project-b', personId: 'eng-1', role: 'Engineer', startDate: '2026-01-01' }),
      makeAllocation({ id: 'b-2', projectId: 'project-b', personId: 'eng-2', role: 'Engineer', startDate: '2026-01-01' }),
    ];

    const plan = planRemovePersonFromProjectSubteam({
      allocations,
      personId: 'eng-1',
      project: subteamProjectA,
      projects: [subteamProjectA, subteamProjectB],
      today: '2026-05-11',
    });

    expect(plan.allocationsToDelete).toEqual([]);
    expect(plan.allocationsToEnd).toEqual([
      expect.objectContaining({ id: 'a-1', endDate: '2026-05-11' }),
      expect.objectContaining({ id: 'b-1', endDate: '2026-05-11' }),
    ]);
  });

  it('deletes allocations started within the last 7 days instead of end-dating them', () => {
    const allocations = [
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-1', role: 'Engineer', startDate: '2026-05-08' }),
      makeAllocation({ id: 'b-1', projectId: 'project-b', personId: 'eng-1', role: 'Engineer', startDate: '2026-05-08' }),
    ];

    const plan = planRemovePersonFromProjectSubteam({
      allocations,
      personId: 'eng-1',
      project: subteamProjectA,
      projects: [subteamProjectA, subteamProjectB],
      today: '2026-05-11',
    });

    expect(plan.allocationsToDelete).toEqual(['a-1', 'b-1']);
    expect(plan.allocationsToEnd).toEqual([]);
  });

  it('splits mixed-age allocations: deletes recent ones, end-dates older ones', () => {
    const allocations = [
      // started 3 days ago — short stay, delete
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-1', role: 'Engineer', startDate: '2026-05-08' }),
      // started 30 days ago — meaningful history, end-date
      makeAllocation({ id: 'b-1', projectId: 'project-b', personId: 'eng-1', role: 'Engineer', startDate: '2026-04-11' }),
    ];

    const plan = planRemovePersonFromProjectSubteam({
      allocations,
      personId: 'eng-1',
      project: subteamProjectA,
      projects: [subteamProjectA, subteamProjectB],
      today: '2026-05-11',
    });

    expect(plan.allocationsToDelete).toEqual(['a-1']);
    expect(plan.allocationsToEnd).toEqual([
      expect.objectContaining({ id: 'b-1', endDate: '2026-05-11' }),
    ]);
  });

  it('treats an allocation started exactly 7 days ago as history, not a short stay', () => {
    const allocations = [
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-1', role: 'Engineer', startDate: '2026-05-04' }),
    ];

    const plan = planRemovePersonFromProjectSubteam({
      allocations,
      personId: 'eng-1',
      project: subteamProjectA,
      projects: [subteamProjectA, subteamProjectB],
      today: '2026-05-11',
    });

    expect(plan.allocationsToDelete).toEqual([]);
    expect(plan.allocationsToEnd).toEqual([
      expect.objectContaining({ id: 'a-1', endDate: '2026-05-11' }),
    ]);
  });

  it('syncs a new project to the current subteam delivery roster only', () => {
    const newProject: Project = {
      ...subteamProjectA,
      id: 'project-c',
      name: 'Project C',
    };
    const allocations = [
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-1', role: 'DRI' }),
      makeAllocation({ id: 'a-2', projectId: 'project-a', personId: 'pm-1', role: 'PM' }),
      makeAllocation({ id: 'b-1', projectId: 'project-b', personId: 'eng-1', role: 'Engineer' }),
    ];

    const plan = planSyncProjectToSubteamRoster({
      allocations,
      createId: nextId,
      project: newProject,
      projects: [subteamProjectA, subteamProjectB, newProject],
      quarter,
      today: '2026-05-11',
    });

    expect(plan).toEqual([
      expect.objectContaining({ projectId: 'project-c', personId: 'eng-1', role: 'Engineer', startDate: '2026-05-11' }),
    ]);
  });
});
