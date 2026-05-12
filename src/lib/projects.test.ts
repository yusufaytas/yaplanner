import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  addProjectMember,
  planAddPersonToProjectSubteam,
  planRemovePersonFromProjectSubteam,
  planSetProjectDri,
  planSyncProjectToSubteamRoster,
  updateProjectSubteam,
} from './projects';
import type { Allocation, Project, Cycle, Person } from './types';

// ─── DB mock ─────────────────────────────────────────────────────────────────
// Stateful in-memory store so updateProjectSubteam can read and write.

type Store = {
  projects: Project[];
  allocations: Allocation[];
  cycles: Cycle[];
};

let store: Store = { projects: [], allocations: [], cycles: [] };

vi.mock('./db', () => {
  const makeTable = (key: keyof Store) => ({
    get: vi.fn(async (id: string) => store[key].find((r: { id: string }) => r.id === id) ?? undefined),
    toArray: vi.fn(async () => [...store[key]]),
    update: vi.fn(async (id: string, patch: object) => {
      const idx = store[key].findIndex((r: { id: string }) => r.id === id);
      if (idx !== -1) Object.assign(store[key][idx] as object, patch);
    }),
    bulkAdd: vi.fn(async (rows: object[]) => {
      (store[key] as object[]).push(...rows);
    }),
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        toArray: vi.fn(async () => []),
      })),
    })),
    orderBy: vi.fn(() => ({ toArray: vi.fn(async () => [...store[key]]) })),
  });

  const db = {
    projects: makeTable('projects'),
    allocations: makeTable('allocations'),
    cycles: makeTable('cycles'),
    cyclePeople: { toArray: vi.fn(async () => []), where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })) },
    cycleProjects: { where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })) },
    subteams: { toArray: vi.fn(async () => []) },
    people: { orderBy: vi.fn(() => ({ toArray: vi.fn(async () => []) })) },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn()),
  };

  return { db };
});

// listResolvedCycles reads db.cycles — mock it to return store.cycles directly
vi.mock('./cycles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cycles')>();
  return {
    ...actual,
    listResolvedCycles: vi.fn(async () => [...store.cycles]),
  };
});

const quarter: Cycle = {
  id: 'q1',
  name: '2026-Q2',
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  status: 'active',
  createdAt: '2026-03-01T00:00:00.000Z',
  createdFromCycleId: null,
  capacityLineAfter: null,
  overhead: { items: [] },
};

beforeEach(() => {
  store = { projects: [], allocations: [], cycles: [] };
  vi.clearAllMocks();
});

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
    cycleId: overrides.cycleId ?? quarter.id,
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

  it('switches the full subteam DRI while preserving history and sibling membership', () => {
    const allocations = [
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-old', role: 'DRI', percentage: 40 }),
      makeAllocation({ id: 'a-2', projectId: 'project-a', personId: 'eng-new', role: 'Engineer', percentage: 60 }),
      makeAllocation({ id: 'b-1', projectId: 'project-b', personId: 'eng-old', role: 'DRI', percentage: 50 }),
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
      expect.objectContaining({ id: 'b-1', endDate: '2026-05-11', role: 'DRI' }),
      expect.objectContaining({ personId: 'eng-old', projectId: 'project-a', role: 'Engineer', startDate: '2026-05-11', endDate: null }),
      expect.objectContaining({ personId: 'eng-old', projectId: 'project-b', role: 'Engineer', startDate: '2026-05-11', endDate: null }),
      expect.objectContaining({ id: 'a-2', endDate: '2026-05-11', role: 'Engineer' }),
      expect.objectContaining({ personId: 'eng-new', projectId: 'project-a', role: 'DRI', startDate: '2026-05-11', endDate: null }),
      expect.objectContaining({ personId: 'eng-new', projectId: 'project-b', role: 'DRI', startDate: '2026-05-11', endDate: null }),
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

    // eng-1 is the subteam DRI, so new sibling projects inherit that DRI
    expect(plan).toEqual([
      expect.objectContaining({ projectId: 'project-c', personId: 'eng-1', role: 'DRI', startDate: '2026-05-11' }),
    ]);
  });

  it('preserves Engineer role when syncing from a sibling project', () => {
    const newProject: Project = { ...subteamProjectA, id: 'project-c', name: 'Project C' };
    const allocations = [
      makeAllocation({ id: 'a-0', projectId: 'project-a', personId: 'dri-1', role: 'DRI' }),
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-1', role: 'Engineer' }),
    ];

    const plan = planSyncProjectToSubteamRoster({
      allocations,
      createId: nextId,
      project: newProject,
      projects: [subteamProjectA, newProject],
      quarter,
      today: '2026-05-11',
    });

    expect(plan).toHaveLength(2);
    expect(new Set(plan.map((allocation) => `${allocation.personId}:${allocation.role}`))).toEqual(
      new Set(['dri-1:DRI', 'eng-1:Engineer']),
    );
  });

  it('uses DRI role when a person has both DRI and Engineer allocations on siblings', () => {
    const newProject: Project = { ...subteamProjectA, id: 'project-c', name: 'Project C' };
    const allocations = [
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-1', role: 'Engineer' }),
      makeAllocation({ id: 'b-1', projectId: 'project-b', personId: 'eng-1', role: 'DRI' }),
    ];

    const plan = planSyncProjectToSubteamRoster({
      allocations,
      createId: nextId,
      project: newProject,
      projects: [subteamProjectA, subteamProjectB, newProject],
      quarter,
      today: '2026-05-11',
    });

    // The presence of a sibling DRI row marks the shared subteam DRI
    expect(plan).toEqual([
      expect.objectContaining({ projectId: 'project-c', personId: 'eng-1', role: 'DRI' }),
    ]);
  });

  it('excludes PM, EM, and Stakeholder from the sync', () => {
    const newProject: Project = { ...subteamProjectA, id: 'project-c', name: 'Project C' };
    const allocations = [
      makeAllocation({ id: 'a-0', projectId: 'project-a', personId: 'dri-1', role: 'DRI' }),
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'pm-1', role: 'PM' }),
      makeAllocation({ id: 'a-2', projectId: 'project-a', personId: 'em-1', role: 'EM' }),
      makeAllocation({ id: 'a-3', projectId: 'project-a', personId: 'sh-1', role: 'Stakeholder' }),
      makeAllocation({ id: 'a-4', projectId: 'project-a', personId: 'eng-1', role: 'Engineer' }),
    ];

    const plan = planSyncProjectToSubteamRoster({
      allocations,
      createId: nextId,
      project: newProject,
      projects: [subteamProjectA, newProject],
      quarter,
      today: '2026-05-11',
    });

    expect(plan).toHaveLength(2);
    expect(new Set(plan.map((allocation) => `${allocation.personId}:${allocation.role}`))).toEqual(
      new Set(['dri-1:DRI', 'eng-1:Engineer']),
    );
  });

  it('does not sync engineers onto a new project when the sibling subteam has no DRI', () => {
    const newProject: Project = { ...subteamProjectA, id: 'project-c', name: 'Project C' };
    const allocations = [
      makeAllocation({ id: 'a-1', projectId: 'project-a', personId: 'eng-1', role: 'Engineer' }),
    ];

    const plan = planSyncProjectToSubteamRoster({
      allocations,
      createId: nextId,
      project: newProject,
      projects: [subteamProjectA, newProject],
      quarter,
      today: '2026-05-11',
    });

    expect(plan).toEqual([]);
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> & Pick<Project, 'id'>): Project {
  return {
    name: overrides.id,
    description: '',
    status: 'Active',
    tags: [],
    subteamId: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    archivedAt: null,
    links: [],
    unknowns: [],
    risks: [],
    ...overrides,
  };
}

function makeAllocationForSubteam(overrides: Partial<Allocation> & Pick<Allocation, 'id' | 'personId' | 'projectId' | 'role'>): Allocation {
  return {
    cycleId: quarter.id,
    startDate: quarter.startDate,
    endDate: null,
    percentage: 50,
    ...overrides,
  };
}

function makePerson(overrides: Partial<Person> & Pick<Person, 'id'>): Person {
  return {
    id: overrides.id,
    name: overrides.id,
    email: null,
    role: 'Engineer',
    defaultCapacity: 100,
    subteamId: null,
    notes: '',
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── updateProjectSubteam ─────────────────────────────────────────────────────

describe('updateProjectSubteam', () => {
  it('sets subteamId on the project', async () => {
    const project = makeProject({ id: 'proj-x', subteamId: null });
    store.projects = [project];
    store.cycles = [quarter];

    await updateProjectSubteam('proj-x', 'subteam-1');

    const updated = store.projects.find((p) => p.id === 'proj-x');
    expect(updated?.subteamId).toBe('subteam-1');
  });

  it('does nothing when the project does not exist', async () => {
    store.projects = [];
    store.cycles = [];

    // Should not throw
    await expect(updateProjectSubteam('ghost', 'subteam-1')).resolves.toBeUndefined();
    expect(store.allocations).toHaveLength(0);
  });

  it('creates 0% allocations for every delivery member on sibling projects', async () => {
    // project-a and project-b are already in subteam-1
    // eng-1 is on project-a (DRI), eng-2 is on project-b (Engineer)
    // project-x is being assigned to subteam-1 — both engineers should get 0% allocations
    const projectA = makeProject({ id: 'project-a', subteamId: 'subteam-1' });
    const projectB = makeProject({ id: 'project-b', subteamId: 'subteam-1' });
    const projectX = makeProject({ id: 'project-x', subteamId: null });

    store.projects = [projectA, projectB, projectX];
    store.cycles = [quarter];
    store.allocations = [
      makeAllocationForSubteam({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'DRI' }),
      makeAllocationForSubteam({ id: 'a2', personId: 'eng-2', projectId: 'project-b', role: 'Engineer' }),
    ];

    await updateProjectSubteam('project-x', 'subteam-1');

    const newAllocs = store.allocations.filter((a) => a.projectId === 'project-x');
    expect(newAllocs).toHaveLength(2);
    expect(newAllocs.every((a) => a.percentage === 0)).toBe(true);
    expect(newAllocs.every((a) => a.endDate === null)).toBe(true);
    expect(new Set(newAllocs.map((a) => a.personId))).toEqual(new Set(['eng-1', 'eng-2']));
  });

  it('creates a DRI allocation when syncing a DRI from a sibling project', async () => {
    const projectA = makeProject({ id: 'project-a', subteamId: 'subteam-1' });
    const projectX = makeProject({ id: 'project-x', subteamId: null });

    store.projects = [projectA, projectX];
    store.cycles = [quarter];
    store.allocations = [
      makeAllocationForSubteam({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'DRI' }),
    ];

    await updateProjectSubteam('project-x', 'subteam-1');

    const newAlloc = store.allocations.find((a) => a.projectId === 'project-x');
    expect(newAlloc?.role).toBe('DRI');
    expect(newAlloc?.percentage).toBe(0);
  });

  it('does not create duplicate allocations for people already on the project', async () => {
    const projectA = makeProject({ id: 'project-a', subteamId: 'subteam-1' });
    const projectX = makeProject({ id: 'project-x', subteamId: null });

    store.projects = [projectA, projectX];
    store.cycles = [quarter];
    store.allocations = [
      makeAllocationForSubteam({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
      // eng-1 is already on project-x
      makeAllocationForSubteam({ id: 'x1', personId: 'eng-1', projectId: 'project-x', role: 'Engineer' }),
    ];

    await updateProjectSubteam('project-x', 'subteam-1');

    const newAllocs = store.allocations.filter((a) => a.projectId === 'project-x');
    // Still just the one pre-existing allocation — no duplicate added
    expect(newAllocs).toHaveLength(1);
    expect(newAllocs[0].id).toBe('x1');
  });

  it('ignores non-delivery roles (PM, EM, Stakeholder) when syncing the roster', async () => {
    const projectA = makeProject({ id: 'project-a', subteamId: 'subteam-1' });
    const projectX = makeProject({ id: 'project-x', subteamId: null });

    store.projects = [projectA, projectX];
    store.cycles = [quarter];
    store.allocations = [
      makeAllocationForSubteam({ id: 'a0', personId: 'dri-1', projectId: 'project-a', role: 'DRI' }),
      makeAllocationForSubteam({ id: 'a1', personId: 'pm-1', projectId: 'project-a', role: 'PM' }),
      makeAllocationForSubteam({ id: 'a2', personId: 'em-1', projectId: 'project-a', role: 'EM' }),
      makeAllocationForSubteam({ id: 'a3', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
    ];

    await updateProjectSubteam('project-x', 'subteam-1');

    const newAllocs = store.allocations.filter((a) => a.projectId === 'project-x');
    expect(newAllocs).toHaveLength(2);
    expect(new Set(newAllocs.map((a) => `${a.personId}:${a.role}`))).toEqual(
      new Set(['dri-1:DRI', 'eng-1:Engineer']),
    );
  });

  it('ignores ended (historical) allocations when building the roster', async () => {
    const projectA = makeProject({ id: 'project-a', subteamId: 'subteam-1' });
    const projectX = makeProject({ id: 'project-x', subteamId: null });

    store.projects = [projectA, projectX];
    store.cycles = [quarter];
    store.allocations = [
      makeAllocationForSubteam({ id: 'a0', personId: 'dri-1', projectId: 'project-a', role: 'DRI' }),
      // eng-1 left project-a — should not be synced
      makeAllocationForSubteam({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer', endDate: '2026-04-15' }),
      // eng-2 is still active
      makeAllocationForSubteam({ id: 'a2', personId: 'eng-2', projectId: 'project-a', role: 'Engineer' }),
    ];

    await updateProjectSubteam('project-x', 'subteam-1');

    const newAllocs = store.allocations.filter((a) => a.projectId === 'project-x');
    expect(newAllocs).toHaveLength(2);
    expect(new Set(newAllocs.map((a) => `${a.personId}:${a.role}`))).toEqual(
      new Set(['dri-1:DRI', 'eng-2:Engineer']),
    );
  });

  it('creates no allocations when the subteam has no other projects', async () => {
    // subteam-1 exists but project-x is its only project after assignment
    const projectX = makeProject({ id: 'project-x', subteamId: null });

    store.projects = [projectX];
    store.cycles = [quarter];
    store.allocations = [];

    await updateProjectSubteam('project-x', 'subteam-1');

    expect(store.allocations).toHaveLength(0);
    expect(store.projects.find((p) => p.id === 'project-x')?.subteamId).toBe('subteam-1');
  });

  it('uses the active cycle start date as allocation start when today is before the cycle', async () => {
    const futureCycle: Cycle = {
      ...quarter,
      id: 'q-future',
      startDate: '2099-01-01',
      endDate: '2099-03-31',
      status: 'active',
    };
    const projectA = makeProject({ id: 'project-a', subteamId: 'subteam-1' });
    const projectX = makeProject({ id: 'project-x', subteamId: null });

    store.projects = [projectA, projectX];
    store.cycles = [futureCycle];
    store.allocations = [
      makeAllocationForSubteam({ id: 'a0', personId: 'dri-1', projectId: 'project-a', role: 'DRI', cycleId: 'q-future' }),
      makeAllocationForSubteam({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer', cycleId: 'q-future' }),
    ];

    await updateProjectSubteam('project-x', 'subteam-1');

    const newAlloc = store.allocations.find((a) => a.projectId === 'project-x');
    expect(newAlloc?.startDate).toBe('2099-01-01');
    expect(newAlloc?.cycleId).toBe('q-future');
  });

  it('creates allocations with null cycleId when there is no active cycle', async () => {
    const closedCycle: Cycle = { ...quarter, id: 'q-closed', status: 'closed' };
    const projectA = makeProject({ id: 'project-a', subteamId: 'subteam-1' });
    const projectX = makeProject({ id: 'project-x', subteamId: null });

    store.projects = [projectA, projectX];
    store.cycles = [closedCycle];
    store.allocations = [
      makeAllocationForSubteam({ id: 'a0', personId: 'dri-1', projectId: 'project-a', role: 'DRI' }),
      makeAllocationForSubteam({ id: 'a1', personId: 'eng-1', projectId: 'project-a', role: 'Engineer' }),
    ];

    await updateProjectSubteam('project-x', 'subteam-1');

    const newAlloc = store.allocations.find((a) => a.projectId === 'project-x');
    expect(newAlloc?.cycleId).toBeNull();
  });
});

describe('addProjectMember', () => {
  it('does not add an engineer when the project or subteam has no active DRI', async () => {
    const project = makeProject({ id: 'project-x', subteamId: null });
    const people = [makePerson({ id: 'eng-1' })];

    await addProjectMember({
      activeCycle: quarter,
      allocations: [],
      personId: 'eng-1',
      people,
      percentage: 40,
      project,
      projects: [project],
      cyclePeople: [],
      role: 'Engineer',
    });

    expect(store.allocations).toEqual([]);
  });
});
