'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getQuarterPersonAvailableWeeks } from '@/lib/quarter-capacity';
import { getPersonProjectCapacityShares, personNeedsProjectCapacity } from '@/lib/project-team';

function uid() { return crypto.randomUUID(); }

export default function QuarterPeopleClient() {
  const { quarterId } = useParams<{ quarterId: string }>();
  const [search, setSearch] = useState('');

  const data = useLiveQuery(async () => {
    const [quarter, people, subteams, quarterPeople, projectRoles, allocations] = await Promise.all([
      db.quarters.get(quarterId),
      db.people.orderBy('name').toArray(),
      db.subteams.toArray(),
      db.quarterPeople.where('quarterId').equals(quarterId).toArray(),
      db.projectRoles.where('quarterId').equals(quarterId).toArray(),
      db.allocations.where('quarterId').equals(quarterId).toArray(),
    ]);
    return { quarter, people, subteams, quarterPeople, projectRoles, allocations };
  }, [quarterId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!data.quarter) return <div className="text-sm text-zinc-400">Quarter not found.</div>;

  const { quarter, people, subteams, quarterPeople, projectRoles, allocations } = data;
  const subteamById = new Map(subteams.map((s) => [s.id, s]));
  const quarterPersonByPersonId = new Map(quarterPeople.map((qp) => [qp.personId, qp]));

  const inQuarter = people.filter((p) => quarterPersonByPersonId.has(p.id));
  const notInQuarter = people.filter((p) => !quarterPersonByPersonId.has(p.id) && personNeedsProjectCapacity(p.role));

  const filteredNotInQuarter = search.trim()
    ? notInQuarter.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : notInQuarter;

  async function addToQuarter(personId: string) {
    await db.quarterPeople.add({
      id: uid(),
      quarterId,
      personId,
      subteamId: people.find((p) => p.id === personId)?.subteamId ?? null,
      inactive: false,
      quarterCapacity: people.find((p) => p.id === personId)?.defaultCapacity ?? 100,
      overheadOverride: null,
    });
  }

  async function removeFromQuarter(personId: string) {
    const qp = quarterPersonByPersonId.get(personId);
    if (qp) await db.quarterPeople.delete(qp.id);
  }

  async function toggleInactive(personId: string) {
    const qp = quarterPersonByPersonId.get(personId);
    if (qp) await db.quarterPeople.update(qp.id, { inactive: !qp.inactive });
  }

  const sorted = [...inQuarter]
    .filter((p) => personNeedsProjectCapacity(p.role))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">

      {/* ── People in this quarter ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            In quarter
            <span className="ml-2 font-normal text-zinc-500">({inQuarter.length})</span>
          </h2>
        </div>

        {inQuarter.length === 0 ? (
          <p className="text-sm text-zinc-600 italic">No people added to this quarter yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {sorted.map((person) => {
              const qp = quarterPersonByPersonId.get(person.id)!;
              const availableWeeks = getQuarterPersonAvailableWeeks(quarter, person, qp);
              const subteam = subteamById.get(qp.subteamId ?? person.subteamId ?? '');

              // Allocated person-weeks across all projects this quarter
              const tracksCapacity = personNeedsProjectCapacity(person.role);
              const assignedProjectIds = projectRoles
                .filter((r) => r.personId === person.id)
                .map((r) => r.projectId);
              const personAllocations = allocations.filter((a) => a.personId === person.id);
              const shares = tracksCapacity
                ? getPersonProjectCapacityShares(person.id, person.defaultCapacity, assignedProjectIds, projectRoles, personAllocations)
                : [];
              const totalAllocatedPct = shares.reduce((sum, s) => sum + s.percentage, 0);
              const allocatedWeeks = Number(((availableWeeks * totalAllocatedPct) / 100).toFixed(1));
              const remainingWeeks = Number((availableWeeks - allocatedWeeks).toFixed(1));
              const overAllocated = remainingWeeks < 0;
              return (
                <div key={person.id} className={`flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 ${qp.inactive ? 'opacity-40' : ''}`}>
                  {/* capacity bar */}
                  <div className="shrink-0 w-0.5 h-8 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="w-full rounded-full bg-sky-400 transition-all"
                      style={{ height: `${Math.min(100, availableWeeks * 8)}%`, marginTop: `${100 - Math.min(100, availableWeeks * 8)}%` }}
                    />
                  </div>

                  {/* name + meta */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/people/${person.id}`} className="text-sm font-medium text-zinc-100 hover:text-sky-300 transition-colors">
                      {person.name}
                    </Link>
                    <span className="ml-2 text-xs text-zinc-600">{person.role}</span>
                    {subteam && <span className="ml-2 text-xs text-zinc-600">· {subteam.name}</span>}
                  </div>

                  {/* est / allocated / remaining */}
                  <div className="shrink-0 flex items-center gap-4 text-xs tabular-nums">
                    {qp.inactive ? (
                      <span className="text-zinc-600">inactive</span>
                    ) : tracksCapacity ? (
                      <>
                        <span className="text-zinc-500" title="Available person-weeks">{availableWeeks} Estimated</span>
                        <span className="text-zinc-400" title="Allocated person-weeks">{allocatedWeeks} Allocated</span>
                        <span className={overAllocated ? 'text-rose-400 font-medium' : 'text-emerald-400'} title="Remaining person-weeks">
                          {overAllocated ? '' : '+'}{remainingWeeks} rem
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-600">{person.role}</span>
                    )}
                  </div>

                  {/* inactive toggle */}
                  <button
                    onClick={() => toggleInactive(person.id)}
                    className="shrink-0 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
                    title={qp.inactive ? 'Mark active' : 'Mark inactive'}
                  >
                    {qp.inactive ? 'Activate' : 'Pause'}
                  </button>

                  {/* remove */}
                  <button
                    onClick={() => removeFromQuarter(person.id)}
                    className="shrink-0 text-zinc-700 hover:text-rose-400 text-xs transition-colors"
                    title="Remove from quarter"
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Add people ── */}
      {notInQuarter.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-200">Add people</h2>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
          />

          {filteredNotInQuarter.length === 0 ? (
            <p className="text-sm text-zinc-600 italic">No people match.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {filteredNotInQuarter.map((person) => {
                const subteam = subteamById.get(person.subteamId ?? '');
                return (
                  <div key={person.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-400">{person.name}</span>
                      <span className="ml-2 text-xs text-zinc-600">{person.role}</span>
                      {subteam && <span className="ml-2 text-xs text-zinc-600">· {subteam.name}</span>}
                    </div>
                    <button
                      onClick={() => addToQuarter(person.id)}
                      className="shrink-0 rounded bg-sky-600/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500 transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
