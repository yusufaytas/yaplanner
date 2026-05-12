import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addPersonToCycle, addProjectToCycle, removePersonFromCycle } from './cycles';
import type { Allocation, CyclePerson, CycleProject } from './types';

type Store = {
  cyclePeople: CyclePerson[];
  cycleProjects: CycleProject[];
  allocations: Allocation[];
};

let store: Store = {
  cyclePeople: [],
  cycleProjects: [],
  allocations: [],
};

function matchesWhere<T extends Record<string, unknown>>(row: T, query: string | Partial<T>, value?: unknown) {
  if (typeof query === 'string') {
    return row[query] === value;
  }
  return Object.entries(query).every(([key, expected]) => row[key] === expected);
}

vi.mock('./db', () => {
  const makeTable = <K extends keyof Store>(key: K) => ({
    add: vi.fn(async (row: Store[K][number]) => {
      (store[key] as Store[K][number][]).push(row);
    }),
    get: vi.fn(async (id: string) => store[key].find((row) => row.id === id)),
    update: vi.fn(async (id: string, patch: object) => {
      const entry = store[key].find((row) => row.id === id);
      if (entry) Object.assign(entry, patch);
    }),
    delete: vi.fn(async (id: string) => {
      store[key] = store[key].filter((row) => row.id !== id) as Store[K];
    }),
    bulkAdd: vi.fn(async (rows: Store[K]) => {
      (store[key] as Store[K][number][]).push(...rows);
    }),
    bulkDelete: vi.fn(async (ids: string[]) => {
      const idSet = new Set(ids);
      store[key] = store[key].filter((row) => !idSet.has(row.id)) as Store[K];
    }),
    where: vi.fn((query: string | Partial<Store[K][number]>) => ({
      equals: vi.fn((value: unknown) => ({
        toArray: vi.fn(async () => store[key].filter((row) => matchesWhere(row, query as string, value))),
      })),
      first: vi.fn(async () => store[key].find((row) => matchesWhere(row, query))),
      toArray: vi.fn(async () => store[key].filter((row) => matchesWhere(row, query))),
    })),
  });

  return {
    db: {
      cyclePeople: makeTable('cyclePeople'),
      cycleProjects: makeTable('cycleProjects'),
      allocations: makeTable('allocations'),
      transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn()),
      cycles: { toArray: vi.fn(async () => []) },
    },
  };
});

describe('cycle mutations', () => {
  beforeEach(() => {
    store = {
      cyclePeople: [],
      cycleProjects: [],
      allocations: [],
    };
    vi.clearAllMocks();
  });

  it('upserts cycle membership instead of creating a duplicate cyclePerson row', async () => {
    store.cyclePeople = [{
      id: 'cp1',
      cycleId: 'q1',
      personId: 'p1',
      subteamId: null,
      inactive: true,
      cycleCapacity: 80,
      overheadOverride: null,
    }];

    await addPersonToCycle({
      id: 'cp2',
      cycleId: 'q1',
      personId: 'p1',
      subteamId: 'st-1',
      cycleCapacity: 100,
    });

    expect(store.cyclePeople).toHaveLength(1);
    expect(store.cyclePeople[0]).toMatchObject({
      id: 'cp1',
      subteamId: 'st-1',
      inactive: false,
      cycleCapacity: 100,
    });
  });

  it('removes cycle allocations when removing a person from a cycle', async () => {
    store.cyclePeople = [{
      id: 'cp1',
      cycleId: 'q1',
      personId: 'p1',
      subteamId: null,
      inactive: false,
      cycleCapacity: 100,
      overheadOverride: null,
    }];
    store.allocations = [
      { id: 'a1', cycleId: 'q1', personId: 'p1', projectId: 'proj-1', role: 'Engineer', startDate: '2026-01-01', endDate: null, percentage: 50 },
      { id: 'a2', cycleId: 'q1', personId: 'p2', projectId: 'proj-1', role: 'Engineer', startDate: '2026-01-01', endDate: null, percentage: 50 },
    ];

    await removePersonFromCycle('cp1');

    expect(store.cyclePeople).toEqual([]);
    expect(store.allocations.map((entry) => entry.id)).toEqual(['a2']);
  });

  it('skips duplicate cycleProject, cyclePeople, and active allocation inserts', async () => {
    store.cycleProjects = [{
      id: 'qp1',
      cycleId: 'q1',
      projectId: 'proj-1',
      status: 'Active',
      priority: 0,
      estimatedPersonWeeks: null,
      notes: '',
      plannedStartWeek: null,
      plannedEndWeek: null,
      targetMilestone: null,
    }];
    store.cyclePeople = [{
      id: 'cp1',
      cycleId: 'q1',
      personId: 'p1',
      subteamId: null,
      inactive: false,
      cycleCapacity: 100,
      overheadOverride: null,
    }];
    store.allocations = [{
      id: 'a1',
      cycleId: 'q1',
      personId: 'p1',
      projectId: 'proj-1',
      role: 'Engineer',
      startDate: '2026-01-01',
      endDate: null,
      percentage: 50,
    }];

    await addProjectToCycle({
      cycleProjectToCreate: {
        id: 'qp2',
        cycleId: 'q1',
        projectId: 'proj-1',
        status: 'Active',
        priority: 1,
        estimatedPersonWeeks: null,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
      cyclePeopleToCreate: [{
        id: 'cp2',
        cycleId: 'q1',
        personId: 'p1',
        subteamId: null,
        inactive: false,
        cycleCapacity: 100,
        overheadOverride: null,
      }],
      allocationsToCreate: [{
        id: 'a2',
        cycleId: 'q1',
        personId: 'p1',
        projectId: 'proj-1',
        role: 'Engineer',
        startDate: '2026-04-01',
        endDate: null,
        percentage: 50,
      }],
    });

    expect(store.cycleProjects).toHaveLength(1);
    expect(store.cyclePeople).toHaveLength(1);
    expect(store.allocations).toHaveLength(1);
  });
});
