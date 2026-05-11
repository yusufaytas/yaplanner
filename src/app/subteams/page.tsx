'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import Link from 'next/link';
import { SubteamCard } from '@/components/subteams/SubteamCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { getSubteamMemberCountBySubteam } from '@/lib/subteams';
import { createSubteam, deleteSubteam, getSubteamsPageData } from '@/lib/subteams';

function uid() { return crypto.randomUUID(); }

export default function SubteamsPage() {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');

  const data = useLiveQuery(() => getSubteamsPageData());

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;

  const { subteams, people, projects, allocations } = data;
  const personById = new Map(people.map((person) => [person.id, person]));
  const memberCountBySubteam = getSubteamMemberCountBySubteam(projects, allocations);

  async function createSubteamHandler() {
    if (!name.trim()) return;
    await createSubteam({ id: uid(), name, purpose: purpose.trim() || null });
    setName('');
    setPurpose('');
    setAdding(false);
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
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 w-48"
          />
          <input
            placeholder="Purpose (optional)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="rounded border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 w-64"
          />
          <button onClick={createSubteamHandler} className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">Create</button>
        </div>
      )}

      {subteams.length === 0 ? (
        <EmptyState title="No subteams yet" description="Create subteams to organize project ownership." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {subteams.map((subteam) => {
            const ownedProjectIds = new Set(projects.filter((project) => project.subteamId === subteam.id).map((project) => project.id));
            const driId = allocations.find(
              (allocation) => allocation.endDate === null && allocation.role === 'DRI' && allocation.projectId && ownedProjectIds.has(allocation.projectId),
            )?.personId;
            const dri = driId ? personById.get(driId) : null;
            return (
              <div key={subteam.id} className="group relative">
                <Link href={`/subteams/${subteam.id}`}>
                  <SubteamCard subteam={subteam} dri={dri} memberCount={memberCountBySubteam.get(subteam.id) ?? 0} />
                </Link>
                <button
                  onClick={() => deleteSubteam(subteam.id)}
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
