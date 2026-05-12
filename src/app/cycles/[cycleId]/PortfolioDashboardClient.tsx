'use client';

import React, { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { ProjectStatusBadge } from '@/components/projects/ProjectStatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { InlineEditNumber } from '@/components/ui/InlineEdit';
import type { CycleProject } from '@/lib/types';
import { getProjectCapacitySummary, getCycleCapacitySummary } from '@/lib/person-capacity';
import { getAddableProjects, getAutoCapacityLineAfter, sortCycleProjects } from '@/lib/cycle-portfolio';
import { planAddProjectToCycle } from '@/lib/cycle-projects';
import {
  addProjectToCycle as persistAddProjectToCycle,
  getAddProjectToCycleData,
  getPortfolioDashboardData,
  savePriorityOrder,
  updateCycleProjectEstimate,
} from '@/lib/cycles';

function uid() { return crypto.randomUUID(); }

// ─── component ────────────────────────────────────────────────────────────────

export default function PortfolioDashboardClient() {
  const { cycleId } = useParams<{ cycleId: string }>();

  // drag state — only indices, no copies of data
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [addingProject, setAddingProject] = useState(false);
  const [newProjectId, setNewProjectId] = useState('');

  const data = useLiveQuery(() => getPortfolioDashboardData(cycleId), [cycleId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;

  const { quarter, cycleProjects, projects, people, cyclePeople, subteams, allocations } = data;

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const subteamById = new Map(subteams.map((s) => [s.id, s]));

  const allocationsByProject = new Map<string, typeof allocations>();
  for (const allocation of allocations) {
    if (!allocation.projectId) continue;
    const arr = allocationsByProject.get(allocation.projectId) ?? [];
    arr.push(allocation);
    allocationsByProject.set(allocation.projectId, arr);
  }

  const sorted = sortCycleProjects(cycleProjects);

  const capacitySummary = quarter ? getCycleCapacitySummary(quarter, people, cyclePeople) : null;
  const addableProjects = getAddableProjects(projects, cycleProjects);

  async function addProject() {
    if (!newProjectId || !quarter) return;
    const { allAllocations } = await getAddProjectToCycleData(cycleId, newProjectId);
    const plan = planAddProjectToCycle({
      quarter,
      cycleProjects,
      cyclePeople,
      projects,
      people,
      allAllocations,
    }, newProjectId, uid);
    if (!plan) return;

    await persistAddProjectToCycle(plan);

    setNewProjectId('');
    setAddingProject(false);
  }

  const cumulativeEstimatedByProjectId = new Map<string, number>();
  let cumulativeEstimatedPersonWeeks = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulativeEstimatedPersonWeeks += sorted[i].estimatedPersonWeeks ?? 0;
    cumulativeEstimatedByProjectId.set(sorted[i].id, Number(cumulativeEstimatedPersonWeeks.toFixed(1)));
  }
  const autoCapacityLineAfter = getAutoCapacityLineAfter(
    sorted,
    capacitySummary?.totalAvailablePersonWeeks ?? null,
  );

  // capacityLineAfter is always auto-calculated from cumulative estimates vs total capacity
  const lineAfter = autoCapacityLineAfter;

  // ── drag handlers for rows ──────────────────────────────────────────────

  function handleRowDragStart(e: React.DragEvent, index: number) {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleRowDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }

  async function handleRowDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === dropIndex) {
      setDragOverIndex(null);
      return;
    }
    const reordered = [...sorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIndex, 0, moved);
    setDragOverIndex(null);
    dragIndexRef.current = null;
    await savePriorityOrder(reordered);
  }

  function handleDragEnd() {
    setDragOverIndex(null);
    dragIndexRef.current = null;
  }

  // ── drag handlers for the capacity line ────────────────────────────────

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">Portfolio</h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-zinc-500">
            Drag rows to reorder
            {capacitySummary && (
              <span className="ml-2 text-zinc-600">
                Total capacity: {capacitySummary.totalAvailablePersonWeeks}pw
              </span>
            )}
          </p>
          {!addingProject && (
            <button
              onClick={() => { setNewProjectId(''); setAddingProject(true); }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8"
            >
              + Add project
            </button>
          )}
        </div>
      </div>

      {addingProject && (
        <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <select
            autoFocus
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none"
          >
            <option value="">Select project…</option>
            {addableProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={addProject}
            disabled={!newProjectId}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
          <button
            onClick={() => { setAddingProject(false); setNewProjectId(''); }}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
          {addableProjects.length === 0 && (
            <span className="text-xs text-zinc-500">All projects are already in this cycle.</span>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          title="No projects in this cycle"
          description="Add projects to this cycle to start planning."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="w-6 px-3 py-3" />
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">#</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Project</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Status</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Subteam</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">DRI</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">EM</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">PM</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Estimated</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Allocated</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Cum PW</th>
                <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Remain</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((qp, index) => {
                const project = projectById.get(qp.projectId);
                if (!project) return null;
                const roles = allocationsByProject.get(project.id) ?? [];
                const dri = roles.find((r) => r.role === 'DRI' && r.endDate === null);
                const em = roles.find((r) => r.role === 'EM' && r.endDate === null);
                const pm = roles.find((r) => r.role === 'PM' && r.endDate === null);
                const subteam = project.subteamId ? subteamById.get(project.subteamId) : null;
                const capacity = quarter
                  ? getProjectCapacitySummary({
                    projectId: project.id,
                    quarter,
                    estimatedPersonWeeks: qp.estimatedPersonWeeks,
                    people,
                    cyclePeople,
                    activeAllocations: allocations,
                  })
                  : null;
                const cumulative = cumulativeEstimatedByProjectId.get(qp.id) ?? 0;
                const remainingCapacity = capacitySummary
                  ? Number((capacitySummary.totalAvailablePersonWeeks - cumulative).toFixed(1))
                  : null;

                const isAboveLine = lineAfter < 0 || index <= lineAfter;
                const isDragTarget = dragOverIndex === index;

                // The capacity line divider renders AFTER this row
                const showLineAfterRow = lineAfter !== null && lineAfter >= 0 && index === lineAfter;

                return (
                  <React.Fragment key={qp.id}>
                    <tr
                      draggable
                      onDragStart={(e) => handleRowDragStart(e, index)}
                      onDragOver={(e) => handleRowDragOver(e, index)}
                      onDrop={(e) => handleRowDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={[
                        'group transition-colors',
                        isAboveLine
                          ? 'hover:bg-white/[0.04]'
                          : 'bg-rose-950/20 hover:bg-rose-950/30',
                        isDragTarget ? 'outline outline-2 outline-sky-400/50' : '',
                      ].join(' ')}
                    >
                      {/* drag handle */}
                      <td className="w-6 px-3 py-3 text-zinc-600 cursor-grab active:cursor-grabbing select-none">
                        ⠿
                      </td>
                      {/* priority number */}
                      <td className="py-3 pr-4 text-zinc-500 tabular-nums">{index + 1}</td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-zinc-100 hover:text-sky-100 hover:underline"
                        >
                          {project.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <ProjectStatusBadge status={qp.status} />
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">{subteam?.name ?? '—'}</td>
                      <td className="py-3 pr-4 text-zinc-200">
                        {dri ? personById.get(dri.personId)?.name ?? '—' : <span className="text-amber-300">Missing</span>}
                      </td>
                      <td className="py-3 pr-4 text-zinc-200">
                        {em ? personById.get(em.personId)?.name ?? '—' : <span className="text-amber-300">Missing</span>}
                      </td>
                      <td className="py-3 pr-4 text-zinc-200">
                        {pm ? personById.get(pm.personId)?.name ?? '—' : <span className="text-zinc-500">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-zinc-200">
                        <InlineEditNumber
                          value={qp.estimatedPersonWeeks ?? 0}
                          onSave={(value) => updateCycleProjectEstimate(qp.id, value)}
                          min={0}
                          max={999}
                          suffix="pw"
                          className={qp.estimatedPersonWeeks === null ? 'text-zinc-500' : 'text-zinc-200'}
                        />
                      </td>
                      <td className="py-3 pr-4 text-zinc-300 tabular-nums">
                        {capacity ? `${capacity.reservedPersonWeeks}pw` : '—'}
                        {capacity && <span className="ml-1 text-xs text-zinc-500">({capacity.reservedWeeklyPeople}/wk)</span>}
                      </td>
                      <td className={`py-3 pr-4 tabular-nums ${!isAboveLine ? 'text-rose-400' : 'text-zinc-200'}`}>
                        {capacitySummary ? `${cumulative}pw` : '—'}
                      </td>
                      <td className={`py-3 pr-4 tabular-nums ${
                        remainingCapacity === null
                          ? 'text-zinc-500'
                          : remainingCapacity < 0
                            ? 'text-rose-400'
                            : remainingCapacity < 5
                              ? 'text-amber-300'
                              : 'text-zinc-200'
                      }`}>
                        {remainingCapacity === null ? '—' : `${remainingCapacity}pw`}
                      </td>
                    </tr>

                    {/* ── capacity line divider ── */}
                    {showLineAfterRow && (
                      <tr key={`line-${qp.id}`} className="select-none">
                        <td colSpan={12} className="p-0">
                          <div className="relative flex items-center gap-2 border-y border-rose-500/60 bg-rose-500/10 px-3 py-1">
                            <span className="text-xs font-semibold text-rose-400 uppercase tracking-widest">
                              ↑ capacity ends here · no capacity ↓
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
