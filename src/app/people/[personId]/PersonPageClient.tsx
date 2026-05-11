'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db } from '@/lib/db';
import { InlineEditText, InlineEditSelect, InlineEditNumber } from '@/components/ui/InlineEdit';
import { getPersonProjectCapacityShares, personNeedsProjectCapacity, planQuarterProjectAllocation } from '@/lib/project-team';
import { getActiveQuarter, listResolvedQuarters } from '@/lib/quarters';

const ROLE_OPTIONS = [
  { value: 'Engineer', label: 'Engineer' },
  { value: 'EM',       label: 'EM'       },
  { value: 'PM',       label: 'PM'       },
];

function uid() { return crypto.randomUUID(); }

export default function PersonPageClient() {
  const { personId } = useParams<{ personId: string }>();

  const data = useLiveQuery(async () => {
    const [person, subteams, quarters, projectRoles, allocations, projects] = await Promise.all([
      db.people.get(personId),
      db.subteams.orderBy('name').toArray(),
      listResolvedQuarters(),
      db.projectRoles.where('personId').equals(personId).toArray(),
      db.allocations.where('personId').equals(personId).toArray(),
      db.projects.toArray(),
    ]);
    return { person, subteams, quarters, projectRoles, allocations, projects };
  }, [personId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!data.person) return <div className="text-sm text-zinc-400">Person not found.</div>;

  const { person, subteams, quarters, projectRoles, allocations, projects } = data;
  const activeQuarter = getActiveQuarter(quarters);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const save = (patch: Parameters<typeof db.people.update>[1]) =>
    db.people.update(personId, patch);

  async function saveProjectCapacity(projectId: string, percentage: number) {
    if (!activeQuarter) return;
    const plan = planQuarterProjectAllocation(
      activeQuarter,
      personId,
      projectId,
      percentage,
      quarterRoles,
      quarterAllocations,
      uid,
    );
    await db.transaction('rw', db.allocations, async () => {
      if (plan.allocationsToDelete.length > 0) {
        await db.allocations.bulkDelete(plan.allocationsToDelete);
      }
      if (plan.allocationsToUpsert.length > 0) {
        await db.allocations.bulkPut(plan.allocationsToUpsert);
      }
    });
  }

  async function removeFromProject(pid: string) {
    if (!activeQuarter) return;
    const roleIds = quarterRoles.filter((r) => r.projectId === pid).map((r) => r.id);
    const allocationIds = quarterAllocations.filter((a) => a.projectId === pid).map((a) => a.id);
    await db.transaction('rw', db.projectRoles, db.allocations, async () => {
      if (roleIds.length > 0) await db.projectRoles.bulkDelete(roleIds);
      if (allocationIds.length > 0) await db.allocations.bulkDelete(allocationIds);
    });
  }
  const quarterRoles = activeQuarter
    ? projectRoles.filter((r) => r.quarterId === activeQuarter.id)
    : [];

  const assignedProjectIds = [...new Set(quarterRoles.map((r) => r.projectId))];
  const quarterAllocations = activeQuarter
    ? allocations.filter((a) => a.quarterId === activeQuarter.id)
    : [];
  const tracksCapacity = personNeedsProjectCapacity(person.role);
  const projectCapacityShares = tracksCapacity
    ? getPersonProjectCapacityShares(
      person.id,
      person.defaultCapacity,
      assignedProjectIds,
      quarterRoles,
      quarterAllocations,
    )
    : [];
  const capacityShareByProject = new Map(projectCapacityShares.map((share) => [share.projectId, share]));
  const totalAllocated = projectCapacityShares.reduce((sum, share) => sum + share.percentage, 0);

  const allocationColor =
    totalAllocated > person.defaultCapacity
      ? 'text-rose-400'
      : totalAllocated >= person.defaultCapacity * 0.8
        ? 'text-amber-300'
        : 'text-emerald-300';

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
              onSave={(v) => save({ role: v, subteamId: v === 'Engineer' ? person.subteamId : null })}
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
      </div>

      {/* ── Project assignments ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            {activeQuarter ? `Projects · ${activeQuarter.name}` : 'Projects'}
          </h2>
          {tracksCapacity && assignedProjectIds.length > 0 && (
            <span className={`text-sm font-medium tabular-nums ${allocationColor}`}>
              {totalAllocated}% allocated
            </span>
          )}
        </div>

        {assignedProjectIds.length === 0 ? (
          <p className="text-sm text-zinc-600 italic">
            Not assigned to any projects this quarter.
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {assignedProjectIds.map((pid) => {
              const project = projectById.get(pid);
              if (!project) return null;

              const roles = quarterRoles.filter((r) => r.projectId === pid);
              const roleLabels = roles.map((r) => r.role).join(', ');
              const isDri = roles.some((r) => r.role === 'DRI');

              const capacityShare = capacityShareByProject.get(pid);
              const displayPct = capacityShare?.percentage ?? 0;
              const isEven = capacityShare?.isEvenSplit ?? true;
              const barWidth = Math.min(100, Math.round((displayPct / person.defaultCapacity) * 100));
              const barColor = displayPct > person.defaultCapacity ? 'bg-rose-500'
                : displayPct >= person.defaultCapacity * 0.8 ? 'bg-amber-400'
                : 'bg-sky-400';

              return (
                <div key={pid} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  {/* left accent bar */}
                  {tracksCapacity && (
                    <div className="shrink-0 w-0.5 h-8 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`w-full rounded-full transition-all ${barColor} ${isEven ? 'opacity-40' : ''}`}
                        style={{ height: `${barWidth}%`, marginTop: `${100 - barWidth}%` }}
                      />
                    </div>
                  )}

                  {/* name + role */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/projects/${pid}`}
                      className="text-sm font-medium text-zinc-100 hover:text-sky-300 transition-colors"
                    >
                      {project.name}
                    </Link>
                    {roleLabels && (
                      <span className="ml-2 text-xs text-zinc-600">{roleLabels}</span>
                    )}
                  </div>

                  {/* capacity % */}
                  {tracksCapacity && (
                    <div className="shrink-0 flex items-center gap-1 text-sm tabular-nums">
                      <InlineEditNumber
                        value={displayPct}
                        onSave={(value) => saveProjectCapacity(pid, value)}
                        min={0}
                        max={100}
                        suffix="%"
                        className={isEven ? 'text-zinc-500' : 'text-zinc-300'}
                      />
                      {isEven && <span className="text-xs text-zinc-600 italic">(even)</span>}
                    </div>
                  )}

                  {/* remove */}
                  {activeQuarter && !isDri ? (
                    <button
                      onClick={() => removeFromProject(pid)}
                      className="shrink-0 text-zinc-700 hover:text-rose-400 text-xs transition-colors"
                      title="Remove from project"
                    >✕</button>
                  ) : (
                    <span className="shrink-0 w-3" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tracksCapacity && assignedProjectIds.length > 0 && (
          <div className="pt-2 border-t border-white/8">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
              <span>Total vs capacity ({person.defaultCapacity}%)</span>
              <span className={allocationColor}>{totalAllocated}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  totalAllocated > person.defaultCapacity ? 'bg-rose-500' :
                  totalAllocated >= person.defaultCapacity * 0.8 ? 'bg-amber-400' :
                  'bg-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.round((totalAllocated / person.defaultCapacity) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
