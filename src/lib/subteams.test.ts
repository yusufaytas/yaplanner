import { describe, expect, it, vi } from 'vitest';

// Mock db so Dexie doesn't instantiate during import
vi.mock('./db', () => ({ db: {} }));

import {
  getSubteamActiveAllocations,
  getSubteamMemberCountBySubteam,
  getSubteamPeople,
  getSubteamProjectCollections,
} from './subteams';
import type { Allocation, Person, Project } from './types';

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> & Pick<Project, 'id' | 'subteamId'>): Project {
  return {
    name: overrides.id,
    description: '',
    status: 'Active',
    tags: [],
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
    startDate: '2026-01-01',
    endDate: null,
    percentage: 100,
    ...overrides,
  };
}

function makePerson(overrides: Partial<Person> & Pick<Person, 'id'>): Person {
  return {
    name: overrides.id,
    email: null,
    role: 'Engineer',
    defaultCapacity: 100,
    subteamId: null,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const projectA = makeProject({ id: 'project-a', subteamId: 'team-1' });
const projectB = makeProject({ id: 'project-b', subteamId: 'team-1' });
const projectC = makeProject({ id: 'project-c', subteamId: 'team-2' });

// ── getSubteamActiveAllocations ───────────────────────────────────────────────

describe('getSubteamActiveAllocations', () => {
  it('returns DRI and Engineer allocations for projects owned by the subteam', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
      makeAllocation({ id: 'a2', personId: 'dri-1', projectId: 'project-a', role: 'DRI' }),
    ];

    const result = getSubteamActiveAllocations([projectA, projectB, projectC], allocations, 'team-1');

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(expect.arrayContaining(['a1', 'a2']));
  });

  it('excludes PM, EM, and Stakeholder roles', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'pm-1', projectId: 'project-a', role: 'PM' }),
      makeAllocation({ id: 'a2', personId: 'em-1', projectId: 'project-a', role: 'EM' }),
      makeAllocation({ id: 'a3', personId: 'sh-1', projectId: 'project-a', role: 'Stakeholder' }),
    ];

    const result = getSubteamActiveAllocations([projectA], allocations, 'team-1');

    expect(result).toHaveLength(0);
  });

  it('excludes ended allocations', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer', endDate: '2026-03-01' }),
    ];

    const result = getSubteamActiveAllocations([projectA], allocations, 'team-1');

    expect(result).toHaveLength(0);
  });

  it('excludes allocations for projects belonging to a different subteam', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-c', role: 'Engineer' }),
    ];

    const result = getSubteamActiveAllocations([projectA, projectC], allocations, 'team-1');

    expect(result).toHaveLength(0);
  });

  it('excludes allocations with a null projectId', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: null, role: 'Engineer' }),
    ];

    const result = getSubteamActiveAllocations([projectA], allocations, 'team-1');

    expect(result).toHaveLength(0);
  });

  it('returns an empty array when there are no projects for the subteam', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
    ];

    const result = getSubteamActiveAllocations([projectA], allocations, 'team-2');

    expect(result).toHaveLength(0);
  });
});

// ── getSubteamPeople ──────────────────────────────────────────────────────────

describe('getSubteamPeople', () => {
  it('returns people whose ids appear in the allocations', () => {
    const people = [makePerson({ id: 'eng-1' }), makePerson({ id: 'eng-2' }), makePerson({ id: 'eng-3' })];
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
      makeAllocation({ id: 'a2', personId: 'eng-2', projectId: 'project-a', role: 'DRI' }),
    ];

    const result = getSubteamPeople(people, allocations);

    expect(result.map((p) => p.id)).toEqual(expect.arrayContaining(['eng-1', 'eng-2']));
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when allocations list is empty', () => {
    const people = [makePerson({ id: 'eng-1' })];

    expect(getSubteamPeople(people, [])).toHaveLength(0);
  });

  it('deduplicates people who appear in multiple allocations', () => {
    const people = [makePerson({ id: 'eng-1' })];
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
      makeAllocation({ id: 'a2', personId: 'eng-1', projectId: 'project-b', role: 'Engineer' }),
    ];

    expect(getSubteamPeople(people, allocations)).toHaveLength(1);
  });
});

// ── getSubteamProjectCollections ──────────────────────────────────────────────

describe('getSubteamProjectCollections', () => {
  it('separates owned projects from projects the subteam contributes to', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-c', role: 'Engineer' }),
    ];

    const { ownedProjects, contributingProjects } = getSubteamProjectCollections(
      [projectA, projectB, projectC],
      allocations,
      'team-1',
    );

    expect(ownedProjects.map((p) => p.id)).toEqual(expect.arrayContaining(['project-a', 'project-b']));
    expect(contributingProjects.map((p) => p.id)).toEqual(['project-c']);
  });

  it('does not include owned projects in contributingProjects', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
    ];

    const { contributingProjects } = getSubteamProjectCollections(
      [projectA, projectB],
      allocations,
      'team-1',
    );

    expect(contributingProjects).toHaveLength(0);
  });

  it('excludes ended allocations from contributing projects', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-c', role: 'Engineer', endDate: '2026-03-01' }),
    ];

    const { contributingProjects } = getSubteamProjectCollections(
      [projectA, projectC],
      allocations,
      'team-1',
    );

    expect(contributingProjects).toHaveLength(0);
  });

  it('excludes PM, EM, and Stakeholder roles from contributing projects', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'pm-1', projectId: 'project-c', role: 'PM' }),
    ];

    const { contributingProjects } = getSubteamProjectCollections(
      [projectA, projectC],
      allocations,
      'team-1',
    );

    expect(contributingProjects).toHaveLength(0);
  });

  it('returns empty collections when there are no projects or allocations', () => {
    const { ownedProjects, contributingProjects } = getSubteamProjectCollections([], [], 'team-1');

    expect(ownedProjects).toHaveLength(0);
    expect(contributingProjects).toHaveLength(0);
  });
});

// ── getSubteamMemberCountBySubteam ────────────────────────────────────────────

describe('getSubteamMemberCountBySubteam', () => {
  it('counts distinct members per subteam', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
      makeAllocation({ id: 'a2', personId: 'eng-2', projectId: 'project-a', role: 'DRI' }),
      makeAllocation({ id: 'a3', personId: 'eng-3', projectId: 'project-c', role: 'Engineer' }),
    ];

    const result = getSubteamMemberCountBySubteam([projectA, projectC], allocations);

    expect(result.get('team-1')).toBe(2);
    expect(result.get('team-2')).toBe(1);
  });

  it('deduplicates a person who works on multiple projects in the same subteam', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
      makeAllocation({ id: 'a2', personId: 'eng-1', projectId: 'project-b', role: 'Engineer' }),
    ];

    const result = getSubteamMemberCountBySubteam([projectA, projectB], allocations);

    expect(result.get('team-1')).toBe(1);
  });

  it('excludes ended allocations', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer', endDate: '2026-03-01' }),
    ];

    const result = getSubteamMemberCountBySubteam([projectA], allocations);

    expect(result.get('team-1')).toBeUndefined();
  });

  it('excludes PM, EM, and Stakeholder roles', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'pm-1', projectId: 'project-a', role: 'PM' }),
      makeAllocation({ id: 'a2', personId: 'em-1', projectId: 'project-a', role: 'EM' }),
    ];

    const result = getSubteamMemberCountBySubteam([projectA], allocations);

    expect(result.get('team-1')).toBeUndefined();
  });

  it('excludes allocations for projects with no subteam', () => {
    const unownedProject = makeProject({ id: 'project-x', subteamId: null });
    const allocations = [
      makeAllocation({ id: 'a1', personId: 'eng-1', projectId: 'project-x', role: 'Engineer' }),
    ];

    const result = getSubteamMemberCountBySubteam([unownedProject], allocations);

    expect(result.size).toBe(0);
  });

  it('returns an empty map when there are no allocations', () => {
    const result = getSubteamMemberCountBySubteam([projectA], []);

    expect(result.size).toBe(0);
  });
});
