'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import Image from 'next/image';
import { db } from '@/lib/db';
import type { Table } from 'dexie';

const navItems = [
  { href: '/',          label: 'Overview' },
  { href: '/projects',  label: 'Projects' },
  { href: '/people',    label: 'People' },
  { href: '/subteams',  label: 'Subteams' },
  { href: '/quarters',  label: 'Quarters' },
];

const TABLES = [
  'people', 'subteams', 'projects', 'projectLinks',
  'projectStakeholders', 'quarters', 'quarterProjects', 'quarterPeople',
  'projectRoles', 'allocations',
  'unknowns', 'risks',
] as const;

async function exportData() {
  const data: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    data[table] = await (db[table] as Table).toArray();
  }
  const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yaplanner-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(file: File) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const data = parsed.data ?? parsed; // support both wrapped and raw formats
  await db.transaction('rw', TABLES.map((t) => db[t] as Table), async () => {
    for (const table of TABLES) {
      if (!Array.isArray(data[table])) continue;
      await (db[table] as Table).clear();
      if (data[table].length > 0) {
        await (db[table] as Table).bulkPut(data[table]);
      }
    }
  });
}

export function AppNav() {
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <nav className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 h-14">
          <Link href="/" className="mr-6 flex items-center gap-2 text-sm font-bold text-zinc-100 tracking-tight">
            <Image src="/yaplanner-logo.png" alt="Yaplanner" width={24} height={24} className="invert" />
            Yaplanner
          </Link>
          {navItems.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/10 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={exportData}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors"
            >
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors"
            >
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await importData(file);
                e.target.value = '';
                window.location.reload();
              }}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}
