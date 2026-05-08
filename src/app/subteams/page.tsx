'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { SubteamCard } from '@/components/subteams/SubteamCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { normalizeSubteamName, suggestSubteamName } from '@/lib/subteams';

function uid() { return crypto.randomUUID(); }

export default function SubteamsPage() {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [newDriPersonId, setNewDriPersonId] = useState('');

  const data = useLiveQuery(async () => {
    const [subteams, people] = await Promise.all([
      db.subteams.orderBy('name').toArray(),
      db.people.toArray(),
    ]);
    return { subteams, people };
  });

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;

  const { subteams, people } = data;
  const engineers = people.filter((person) => person.role === 'Engineer');
  const personById = new Map(people.map((p) => [p.id, p]));
  const memberCountBySubteam = new Map<string, number>();
  for (const p of engineers) {
    if (p.subteamId) {
      memberCountBySubteam.set(p.subteamId, (memberCountBySubteam.get(p.subteamId) ?? 0) + 1);
    }
  }

  async function createSubteam() {
    const normalizedName = normalizeSubteamName(name);
    if (!normalizedName || !newDriPersonId) return;
    const subteamId = uid();
    await db.transaction('rw', db.subteams, db.people, async () => {
      await db.subteams.add({
        id: subteamId,
        name: normalizedName,
        purpose: purpose.trim() || null,
        driPersonId: newDriPersonId,
        createdAt: new Date().toISOString(),
      });
      await db.people.update(newDriPersonId, { subteamId });
    });
    setName(''); setPurpose(''); setNewDriPersonId(''); setAdding(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-50">Subteams</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8"
        >+ Add subteam</button>
      </div>

      {adding && (
        <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input
            autoFocus
            placeholder="Subteam name"
            value={name}
            onChange={(e) => setName(normalizeSubteamName(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') createSubteam(); if (e.key === 'Escape') setAdding(false); }}
            className="rounded border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 w-48 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
            maxLength={10}
          />
          <p className="text-xs text-zinc-500">Short names only, up to 10 chars. Example: <code>{suggestSubteamName(purpose || name || 'platform infra')}</code></p>
          <input
            placeholder="Purpose (optional)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="rounded border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 w-64 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
          />
          <select
            value={newDriPersonId}
            onChange={(e) => setNewDriPersonId(e.target.value)}
            className="rounded border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
          >
            <option value="">Select DRI engineer…</option>
            {engineers.map((engineer) => (
              <option key={engineer.id} value={engineer.id}>{engineer.name}</option>
            ))}
          </select>
          <button onClick={createSubteam} className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">Create</button>
          <button onClick={() => { setAdding(false); setNewDriPersonId(''); }} className="text-sm text-zinc-500 hover:text-zinc-300">Cancel</button>
        </div>
      )}

      {subteams.length === 0 ? (
        <EmptyState title="No subteams yet" description="Create subteams to organise your people." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {subteams.map((subteam) => {
            const dri = subteam.driPersonId ? personById.get(subteam.driPersonId) : null;
            return (
              <div key={subteam.id} className="group relative">
                <Link href={`/subteams/${subteam.id}`}>
                  <SubteamCard
                    subteam={subteam}
                    dri={dri}
                    memberCount={memberCountBySubteam.get(subteam.id) ?? 0}
                  />
                </Link>
                <button
                  onClick={() => db.subteams.delete(subteam.id)}
                  className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-zinc-500 hover:bg-rose-900/60 hover:text-rose-400 text-xs"
                  title="Delete subteam"
                >✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
