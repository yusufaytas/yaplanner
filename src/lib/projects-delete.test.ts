import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteProjectCascade } from './projects';
import type { Allocation, CyclePerson, CycleProject, Person, Project, Subteam } from './types';

type Store = {
  projects: Project[];
  allocations: Allocation[];
  cycleProjects: CycleProject[];
  subteams: Subteam[];
  people: Person[];
  cyclePeople: CyclePerson[];
};

let store: Store = {
  projects: [],
  allocations: [],
  cycleProjects: [],
  subteams: [],
  people: [],
  cyclePeople: [],
};

function matchesWhere<T extends Record<string, unknown>>(row: T, query: string | Partial<T>, value?: unknown) {
  if (typeof query === 'string') {
    return row[query] === value;
  }
  return Object.entries(query).every(([key, expected]) => row[key] === expected);
}

vi.mock('./db', () => {
  const makeTable = <K extends keyof Store>(key: K) => ({
    delete: vi.fn(async (id: string) => {
      store[key] = store[key].filter((row) => row.id !== id) as Store[K];
    }),
    bulkDelete: vi.fn(async (ids: string[]) => {
      const idSet = new Set(ids);
      store[key] = store[key].filter((row) => !idSet.has(row.id)) as Store[K];
    }),
    bulkPut: vi.fn(async (rows: Store[K]) => {
      for (const row of rows) {
        const index = store[key].findIndex((entry) => entry.id === row.id);
        if (index >= 0) {
          (store[key][index] as Store[K][number]) = row;
        } else {
          (store[key] as Store[K][number][]).push(row);
        }
      }
    }),
    where: vi.fn((query: string | Partial<Store[K][number]>) => ({
      equals: vi.fn((value: unknown) => ({
        toArray: vi.fn(async () => store[key].filter((row) => matchesWhere(row, query as string, value))),
      })),
      toArray: vi.fn(async () => store[key].filter((row) => matchesWhere(row, query))),
    })),
  });

  return {
    db: {
      projects: makeTable('projects'),
      allocations: makeTable('allocations'),
      cycleProjects: makeTable('cycleProjects'),
      subteams: makeTable('subteams'),
      people: makeTable('people'),
      cyclePeople: makeTable('cyclePeople'),
      transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn()),
      cycles: { toArray: vi.fn(async () => []) },
    },
  };
});

describe('deleteProjectCascade', () => {
  beforeEach(() => {
    store = {
      projects: [],
      allocations: [],
      cycleProjects: [],
      subteams: [{ id: 'st-1', name: 'Platform', purpose: null, createdAt: '' }],
      people: [{ id: 'p1', name: 'Alex', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: 'st-1', notes: '', createdAt: '' }],
      cyclePeople: [{ id: 'cp1', cycleId: 'q1', personId: 'p1', subteamId: 'st-1', inactive: false, cycleCapacity: 100, overheadOverride: null }],
    };
    vi.clearAllMocks();
  });

  it('keeps the subteam when sibling projects still reference it', async () => {
    store.projects = [
      { id: 'proj-1', name: 'A', description: '', status: 'Active', tags: [], subteamId: 'st-1', createdAt: '', archivedAt: null, links: [], unknowns: [], risks: [] },
      { id: 'proj-2', name: 'B', description: '', status: 'Active', tags: [], subteamId: 'st-1', createdAt: '', archivedAt: null, links: [], unknowns: [], risks: [] },
    ];

    await deleteProjectCascade('proj-1', 'st-1');

    expect(store.projects.map((entry) => entry.id)).toEqual(['proj-2']);
    expect(store.subteams.map((entry) => entry.id)).toEqual(['st-1']);
    expect(store.people[0]?.subteamId).toBe('st-1');
  });

  it('cleans subteam references before deleting the last project-owned subteam', async () => {
    store.projects = [
      { id: 'proj-1', name: 'A', description: '', status: 'Active', tags: [], subteamId: 'st-1', createdAt: '', archivedAt: null, links: [], unknowns: [], risks: [] },
    ];

    await deleteProjectCascade('proj-1', 'st-1');

    expect(store.projects).toEqual([]);
    expect(store.subteams).toEqual([]);
    expect(store.people[0]?.subteamId).toBeNull();
    expect(store.cyclePeople[0]?.subteamId).toBeNull();
  });
});
