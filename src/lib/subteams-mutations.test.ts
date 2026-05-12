import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteSubteam } from './subteams';
import type { CyclePerson, Person, Project, Subteam } from './types';

type Store = {
  subteams: Subteam[];
  projects: Project[];
  people: Person[];
  cyclePeople: CyclePerson[];
};

let store: Store = {
  subteams: [],
  projects: [],
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
      subteams: makeTable('subteams'),
      projects: makeTable('projects'),
      people: makeTable('people'),
      cyclePeople: makeTable('cyclePeople'),
      transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn()),
    },
  };
});

describe('deleteSubteam', () => {
  beforeEach(() => {
    store = {
      subteams: [{ id: 'st-1', name: 'Platform', purpose: null, createdAt: '' }],
      projects: [],
      people: [
        { id: 'p1', name: 'Alex', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: 'st-1', notes: '', createdAt: '' },
      ],
      cyclePeople: [
        { id: 'cp1', cycleId: 'q1', personId: 'p1', subteamId: 'st-1', inactive: false, cycleCapacity: 100, overheadOverride: null },
      ],
    };
    vi.clearAllMocks();
  });

  it('refuses to delete a subteam that still owns projects', async () => {
    store.projects = [{
      id: 'proj-1',
      name: 'Project',
      description: '',
      status: 'Active',
      tags: [],
      subteamId: 'st-1',
      createdAt: '',
      archivedAt: null,
      links: [],
      unknowns: [],
      risks: [],
    }];

    await expect(deleteSubteam('st-1')).rejects.toThrow('Cannot delete a subteam that still owns projects.');
    expect(store.subteams).toHaveLength(1);
  });

  it('nulls person and cyclePerson references before deleting the subteam', async () => {
    await deleteSubteam('st-1');

    expect(store.subteams).toEqual([]);
    expect(store.people[0]?.subteamId).toBeNull();
    expect(store.cyclePeople[0]?.subteamId).toBeNull();
  });
});
