import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePerson } from './people';
import type { Allocation, CyclePerson, Person } from './types';

type Store = {
  people: Person[];
  cyclePeople: CyclePerson[];
  allocations: Allocation[];
};

let store: Store = {
  people: [],
  cyclePeople: [],
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
    delete: vi.fn(async (id: string) => {
      store[key] = store[key].filter((row) => row.id !== id) as Store[K];
    }),
    bulkDelete: vi.fn(async (ids: string[]) => {
      const idSet = new Set(ids);
      store[key] = store[key].filter((row) => !idSet.has(row.id)) as Store[K];
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
      people: makeTable('people'),
      cyclePeople: makeTable('cyclePeople'),
      allocations: makeTable('allocations'),
      transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn()),
    },
  };
});

describe('deletePerson', () => {
  beforeEach(() => {
    store = {
      people: [
        { id: 'p1', name: 'Alex', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
        { id: 'p2', name: 'Bri', email: null, role: 'PM', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
      ],
      cyclePeople: [
        { id: 'cp1', cycleId: 'q1', personId: 'p1', subteamId: null, inactive: false, cycleCapacity: 100, overheadOverride: null },
      ],
      allocations: [
        { id: 'a1', cycleId: 'q1', personId: 'p1', projectId: 'proj-1', role: 'Engineer', startDate: '2026-01-01', endDate: null, percentage: 50 },
        { id: 'a2', cycleId: 'q1', personId: 'p2', projectId: 'proj-1', role: 'PM', startDate: '2026-01-01', endDate: null, percentage: 0 },
      ],
    };
    vi.clearAllMocks();
  });

  it('cascades cyclePeople and allocations for the deleted person', async () => {
    await deletePerson('p1');

    expect(store.people.map((entry) => entry.id)).toEqual(['p2']);
    expect(store.cyclePeople).toEqual([]);
    expect(store.allocations.map((entry) => entry.id)).toEqual(['a2']);
  });
});
