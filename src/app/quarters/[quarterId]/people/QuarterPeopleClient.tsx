'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { getQuarterPeopleLists } from '@/lib/quarter-people';
import { getQuarterPersonProjectSummary } from '@/lib/person-capacity';
import { addPersonToQuarter, getQuarterPeoplePageData, removePersonFromQuarter, updateQuarterPerson } from '@/lib/quarters';

function uid() { return crypto.randomUUID(); }

export default function QuarterPeopleClient() {
  const { quarterId } = useParams<{ quarterId: string }>();
  const [search, setSearch] = useState('');

  const data = useLiveQuery(() => getQuarterPeoplePageData(quarterId), [quarterId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!data.quarter) return <div className="text-sm text-zinc-400">Quarter not found.</div>;

  const { quarter, people, subteams, quarterPeople, allocations } = data;
  const subteamById = new Map(subteams.map((s) => [s.id, s]));
  const { inQuarter, sortedInQuarter: sorted, notInQuarter, filteredNotInQuarter, quarterPersonByPersonId } =
    getQuarterPeopleLists(people, quarterPeople, search);

  async function addToQuarter(personId: string) {
    await addPersonToQuarter({
      id: uid(),
      quarterId,
      personId,
      subteamId: people.find((p) => p.id === personId)?.subteamId ?? null,
      quarterCapacity: people.find((p) => p.id === personId)?.defaultCapacity ?? 100,
    });
  }

  async function removeFromQuarter(personId: string) {
    const qp = quarterPersonByPersonId.get(personId);
    if (qp) await removePersonFromQuarter(qp.id);
  }

  async function toggleInactive(personId: string) {
    const qp = quarterPersonByPersonId.get(personId);
    if (qp) await updateQuarterPerson(qp.id, { inactive: !qp.inactive });
  }

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
              const summary = getQuarterPersonProjectSummary(quarter, person, qp, allocations);
              const subteam = subteamById.get(qp.subteamId ?? person.subteamId ?? '');
              return (
                <div key={person.id} className={`flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 ${qp.inactive ? 'opacity-40' : ''}`}>
                  {/* capacity bar */}
                  <div className="shrink-0 w-0.5 h-8 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="w-full rounded-full bg-sky-400 transition-all"
                      style={{ height: `${Math.min(100, summary.availableWeeks * 8)}%`, marginTop: `${100 - Math.min(100, summary.availableWeeks * 8)}%` }}
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
                    ) : summary.tracksCapacity ? (
                      <>
                        <span className="text-zinc-500" title="Available person-weeks">{summary.availableWeeks} Estimated</span>
                        <span className="text-zinc-400" title="Allocated person-weeks">{summary.allocatedWeeks} Allocated</span>
                        <span className={summary.overAllocated ? 'text-rose-400 font-medium' : 'text-emerald-400'} title="Remaining person-weeks">
                          {summary.overAllocated ? '0 rem' : `+${Math.max(0, summary.remainingWeeks)} rem`}
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
