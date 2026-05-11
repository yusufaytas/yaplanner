'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { InlineEditText, InlineEditSelect, InlineEditNumber } from '@/components/ui/InlineEdit';
import { getQuarterPersonProjectSummary, personTracksCapacity } from '@/lib/person-capacity';
import { getProjectMemberAllocationMax, updateProjectMemberAllocationPercentage } from '@/lib/projects';
import { getPersonPageData, updatePerson } from '@/lib/people';
import { getActiveQuarter } from '@/lib/quarters';
import type { Role } from '@/lib/types';

const ROLE_OPTIONS = [
  { value: 'Engineer', label: 'Engineer' },
  { value: 'EM', label: 'EM' },
  { value: 'PM', label: 'PM' },
];


export default function PersonPageClient() {
  const { personId } = useParams<{ personId: string }>();

  const data = useLiveQuery(() => getPersonPageData(personId), [personId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!data.person) return <div className="text-sm text-zinc-400">Person not found.</div>;

  const { person, subteams, allocations, projects, quarters, quarterPeople } = data;
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const activeQuarter = getActiveQuarter(quarters);
  const activeQuarterPerson = activeQuarter
    ? quarterPeople.find((entry) => entry.personId === person.id && entry.quarterId === activeQuarter.id)
    : undefined;
  const activeQuarterSummary = activeQuarter && activeQuarterPerson && personTracksCapacity(person.role)
    ? getQuarterPersonProjectSummary(activeQuarter, person, activeQuarterPerson, allocations)
    : null;

  const save = (patch: Parameters<typeof updatePerson>[1]) =>
    updatePerson(personId, patch);

  async function saveProjectAllocationPercentage(projectId: string, percentage: number) {
    await updateProjectMemberAllocationPercentage({
      allocations,
      personId,
      projectId,
      percentage,
    });
  }

  // All projects the person is currently on (active allocations, any quarter)
  const currentProjectIds = [...new Set(
    allocations.filter((a) => a.endDate === null && a.projectId).map((a) => a.projectId as string),
  )];

  // All projects the person was previously on (ended allocations), excluding currently active ones
  const currentProjectIdSet = new Set(currentProjectIds);
  const pastProjectIds = [...new Set(
    allocations
      .filter((a) => a.endDate !== null && a.projectId && !currentProjectIdSet.has(a.projectId as string))
      .map((a) => a.projectId as string),
  )];

  return (
    <div className="space-y-6">

      {/* ── Profile card ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">
            <InlineEditText
              value={person.name}
              onSave={(v) => save({ name: v })}
              className="text-2xl font-bold"
            />
          </h1>
          <p className="mt-0.5 text-sm text-zinc-400 flex items-center gap-1.5 flex-wrap">
            <InlineEditSelect
              value={person.role}
              options={ROLE_OPTIONS}
              onSave={(v) => save({ role: v as Role, subteamId: v === 'Engineer' ? person.subteamId : null })}
              className="text-sm text-zinc-400"
            />
            <span className="text-zinc-600">·</span>
            <InlineEditSelect
              value={person.subteamId ?? ''}
              options={[
                { value: '', label: 'No subteam' },
                ...subteams.map((s) => ({ value: s.id, label: s.name })),
              ]}
              onSave={(v) => save({ subteamId: v || null })}
              className="text-sm text-zinc-400"
            />
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Email</p>
            <InlineEditText
              value={person.email ?? ''}
              onSave={(v) => save({ email: v || null })}
              placeholder="Add email…"
              emptyLabel="—"
              className="text-zinc-200"
            />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Default capacity</p>
            <InlineEditNumber
              value={person.defaultCapacity}
              onSave={(v) => save({ defaultCapacity: v })}
              min={0}
              max={100}
              suffix="%"
              className="text-zinc-200"
            />
          </div>
        </div>

        {activeQuarterSummary && (
          <div className={`rounded-xl border px-3 py-2 text-sm ${
            activeQuarterSummary.overAllocated
              ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
              : 'border-white/10 bg-white/[0.02] text-zinc-300'
          }`}>
            <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">{activeQuarter?.name}</span>
            <p className="mt-1">
              {activeQuarterSummary.overAllocated
                ? `Over capacity: ${activeQuarterSummary.allocatedWeeks}w allocated against ${activeQuarterSummary.availableWeeks}w available`
                : `${Math.max(0, activeQuarterSummary.remainingWeeks)}w free · ${activeQuarterSummary.allocatedWeeks}w allocated of ${activeQuarterSummary.availableWeeks}w available`}
            </p>
          </div>
        )}
      </div>

      {/* ── Currently on (all active allocations) ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">Currently on</h2>
        {currentProjectIds.length === 0 ? (
          <p className="text-sm text-zinc-600 italic">Not on any projects.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {currentProjectIds.map((pid) => {
              const project = projectById.get(pid);
              if (!project) return null;
              const activeAllocs = allocations.filter((a) => a.projectId === pid && a.endDate === null);
              const activeRoles = [...new Set(activeAllocs.map((a) => a.role))];
              const editableAllocation = activeAllocs.find((a) => a.role === 'Engineer' || a.role === 'DRI') ?? null;
              const totalPct = activeAllocs.reduce((sum, a) => sum + a.percentage, 0);
              const maxAllocation = activeQuarter
                ? getProjectMemberAllocationMax({
                  allocations,
                  person,
                  projectId: pid,
                  quarterId: activeQuarter.id,
                  quarterPeople,
                })
                : 100;
              return (
                <div key={pid} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <Link
                    href={`/projects/${pid}`}
                    className="text-sm font-medium text-zinc-100 hover:text-sky-300 transition-colors"
                  >
                    {project.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    {activeRoles.map((role) => (
                      <span
                        key={role}
                        className="text-xs px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400"
                      >
                        {role}
                      </span>
                    ))}
                    {editableAllocation ? (
                      <InlineEditNumber
                        value={editableAllocation.percentage}
                        onSave={(value) => saveProjectAllocationPercentage(pid, value)}
                        min={0}
                        max={maxAllocation}
                        suffix="%"
                        className="text-xs tabular-nums font-medium text-zinc-300"
                      />
                    ) : totalPct > 0 ? (
                      <span className="text-xs tabular-nums font-medium text-zinc-300">{totalPct}%</span>
                    ) : null}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      project.status === 'Active' ? 'bg-emerald-900/40 text-emerald-400' :
                      project.status === 'On Hold' ? 'bg-amber-900/40 text-amber-400' :
                      'bg-white/[0.06] text-zinc-500'
                    }`}>
                      {project.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Previously on (ended allocations) ── */}
      {pastProjectIds.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400">Previously on</h2>
          <div className="divide-y divide-white/5">
            {pastProjectIds.map((pid) => {
              const project = projectById.get(pid);
              if (!project) return null;
              const pastAllocs = allocations.filter((a) => a.projectId === pid && a.endDate !== null);
              const pastRoles = [...new Set(pastAllocs.map((a) => a.role))];
              const lastPct = pastAllocs.length > 0
                ? Math.max(...pastAllocs.map((a) => a.percentage))
                : 0;
              return (
                <div key={pid} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <Link
                    href={`/projects/${pid}`}
                    className="text-sm font-medium text-zinc-500 hover:text-sky-400 transition-colors"
                  >
                    {project.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    {pastRoles.map((role) => (
                      <span
                        key={role}
                        className="text-xs px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-600"
                      >
                        {role}
                      </span>
                    ))}
                    {lastPct > 0 && (
                      <span className="text-xs tabular-nums text-zinc-600">{lastPct}%</span>
                    )}
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-600">
                      {project.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
