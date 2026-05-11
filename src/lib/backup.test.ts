import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { serializeBackupPayload, importBackupText } from './backup';
import type { BackupPayload } from './backup';

// Mock the db module so importBackupText doesn't need a real IndexedDB
vi.mock('./db', () => {
  const makeTable = () => ({
    toArray: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
    bulkPut: vi.fn().mockResolvedValue(undefined),
  });

  const tables = ['people', 'subteams', 'projects', 'quarters', 'quarterProjects', 'quarterPeople', 'allocations'];
  const db: Record<string, ReturnType<typeof makeTable>> & { transaction: ReturnType<typeof vi.fn> } = {
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn()),
  } as never;

  for (const table of tables) {
    db[table] = makeTable();
  }

  return { db };
});

const samplePayload: BackupPayload = {
  version: 1,
  exportedAt: '2026-05-11T00:00:00.000Z',
  data: {
    people: [{ id: 'p1', name: 'Alice' }],
    subteams: [],
    projects: [],
    quarters: [],
    quarterProjects: [],
    quarterPeople: [],
    allocations: [],
  },
};

describe('serializeBackupPayload', () => {
  it('produces valid JSON', () => {
    const json = serializeBackupPayload(samplePayload);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('round-trips the payload without data loss', () => {
    const json = serializeBackupPayload(samplePayload);
    const parsed = JSON.parse(json) as BackupPayload;
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe('2026-05-11T00:00:00.000Z');
    expect(parsed.data.people).toEqual([{ id: 'p1', name: 'Alice' }]);
  });

  it('pretty-prints with 2-space indentation', () => {
    const json = serializeBackupPayload(samplePayload);
    // Pretty-printed JSON has newlines
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });
});

describe('importBackupText', () => {
  it('accepts a wrapped payload with a "data" key', async () => {
    const { db } = await import('./db');
    const json = JSON.stringify({
      version: 1,
      exportedAt: '2026-05-11T00:00:00.000Z',
      data: {
        people: [{ id: 'p1' }],
        subteams: [],
        projects: [],
        quarters: [],
        quarterProjects: [],
        quarterPeople: [],
        allocations: [],
      },
    });
    await importBackupText(json);
    // people table should have been cleared and repopulated
    expect(db.people.clear).toHaveBeenCalled();
    expect(db.people.bulkPut).toHaveBeenCalledWith([{ id: 'p1' }]);
  });

  it('accepts a legacy flat payload without a "data" wrapper', async () => {
    const { db } = await import('./db');
    vi.clearAllMocks();
    const json = JSON.stringify({
      people: [{ id: 'p2' }],
      subteams: [],
      projects: [],
      quarters: [],
      quarterProjects: [],
      quarterPeople: [],
      allocations: [],
    });
    await importBackupText(json);
    expect(db.people.clear).toHaveBeenCalled();
    expect(db.people.bulkPut).toHaveBeenCalledWith([{ id: 'p2' }]);
  });

  it('skips tables whose data is not an array', async () => {
    const { db } = await import('./db');
    vi.clearAllMocks();
    const json = JSON.stringify({
      data: {
        people: 'not-an-array',
        subteams: [],
        projects: [],
        quarters: [],
        quarterProjects: [],
        quarterPeople: [],
        allocations: [],
      },
    });
    await importBackupText(json);
    expect(db.people.clear).not.toHaveBeenCalled();
    expect(db.people.bulkPut).not.toHaveBeenCalled();
  });

  it('does not call bulkPut when a table array is empty', async () => {
    const { db } = await import('./db');
    vi.clearAllMocks();
    const json = JSON.stringify({
      data: {
        people: [],
        subteams: [],
        projects: [],
        quarters: [],
        quarterProjects: [],
        quarterPeople: [],
        allocations: [],
      },
    });
    await importBackupText(json);
    expect(db.people.clear).toHaveBeenCalled();
    expect(db.people.bulkPut).not.toHaveBeenCalled();
  });
});
