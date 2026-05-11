import { db } from '@/lib/db';
import type { Table } from 'dexie';

export const TABLES = [
  'people', 'subteams', 'projects',
  'quarters', 'quarterProjects', 'quarterPeople',
  'allocations',
] as const;

export type BackupTableName = typeof TABLES[number];

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  data: Record<BackupTableName, unknown[]>;
};

export async function collectBackupPayload(): Promise<BackupPayload> {
  const data = {} as Record<BackupTableName, unknown[]>;

  for (const table of TABLES) {
    data[table] = await (db[table] as Table).toArray();
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function serializeBackupPayload(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

export async function buildBackupJson(): Promise<string> {
  return serializeBackupPayload(await collectBackupPayload());
}

export async function downloadBackupFile() {
  const json = await buildBackupJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yaplanner-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackupText(text: string) {
  const parsed = JSON.parse(text) as unknown;
  let data: Partial<Record<BackupTableName, unknown[]>> = {};

  if (parsed && typeof parsed === 'object' && 'data' in parsed) {
    const wrappedData = parsed.data;
    if (wrappedData && typeof wrappedData === 'object') {
      data = wrappedData as Partial<Record<BackupTableName, unknown[]>>;
    }
  } else if (parsed && typeof parsed === 'object') {
    data = parsed as Partial<Record<BackupTableName, unknown[]>>;
  }

  await db.transaction('rw', TABLES.map((table) => db[table] as Table), async () => {
    for (const table of TABLES) {
      const rows = data[table];
      if (!Array.isArray(rows)) continue;
      await (db[table] as Table).clear();
      if (rows.length > 0) {
        await (db[table] as Table).bulkPut(rows);
      }
    }
  });
}

export async function importBackupFile(file: File) {
  await importBackupText(await file.text());
}
