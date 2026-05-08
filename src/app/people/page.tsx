'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { PersonCard } from '@/components/people/PersonCard';
import { EmptyState } from '@/components/ui/EmptyState';

function uid() { return crypto.randomUUID(); }

export default function PeoplePage() {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('Engineer');
  const [subteamId, setSubteamId] = useState('');
  const isEngineer = role === 'Engineer';

  const data = useLiveQuery(async () => {
    const [people, subteams] = await Promise.all([
      db.people.orderBy('name').toArray(),
      db.subteams.orderBy('name').toArray(),
    ]);
    return { people, subteams };
  });

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;

  const { people, subteams } = data;
  const subteamById = new Map(subteams.map((s) => [s.id, s]));

  async function createPerson() {
    if (!name.trim()) return;
    await db.people.add({
      id: uid(), name: name.trim(), email: null, role,
      defaultCapacity: 100, subteamId: isEngineer ? subteamId || null : null,
      notes: '', createdAt: new Date().toISOString(),
    });
    setName(''); setAdding(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-50">People</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8"
        >+ Add person</button>
      </div>

      {adding && (
        <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input
            autoFocus
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createPerson(); if (e.key === 'Escape') setAdding(false); }}
            className="rounded border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 w-48 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
          />
          <select
            value={role}
            onChange={(e) => {
              const nextRole = e.target.value;
              setRole(nextRole);
              if (nextRole !== 'Engineer') setSubteamId('');
            }}
            className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
          >
            {['Engineer', 'EM', 'PM'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={subteamId}
            onChange={(e) => setSubteamId(e.target.value)}
            disabled={!isEngineer}
            className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
          >
            <option value="">{isEngineer ? 'No subteam' : 'Engineers only'}</option>
            {subteams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={createPerson} className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">Add</button>
          <button onClick={() => setAdding(false)} className="text-sm text-zinc-500 hover:text-zinc-300">Cancel</button>
        </div>
      )}

      {people.length === 0 ? (
        <EmptyState title="No people yet" description="Add people to start planning resourcing." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {people.map((person) => {
            const subteam = person.subteamId ? subteamById.get(person.subteamId) : null;
            return (
              <div key={person.id} className="group relative">
                <Link href={`/people/${person.id}`}>
                  <PersonCard person={person} subteamName={subteam?.name} />
                </Link>
                <button
                  onClick={() => db.people.delete(person.id)}
                  className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-zinc-500 hover:bg-rose-900/60 hover:text-rose-400 text-xs"
                  title="Delete person"
                >✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
