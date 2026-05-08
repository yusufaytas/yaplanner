'use client';

import React, { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db } from '@/lib/db';
import { ProjectStatusBadge } from '@/components/projects/ProjectStatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { InlineEditNumber } from '@/components/ui/InlineEdit';
import type { QuarterProject } from '@/lib/types';
import { getProjectCapacitySummary, getQuarterCapacitySummary } from '@/lib/quarter-capacity';

function uid() { return crypto.randomUUID(); }

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Persist a new priority order to Dexie in one transaction. */
async function savePriorityOrder(ordered: QuarterProject[]) {
  await db.transaction('rw', db.quarterProjects, async () => {
    for (let i = 0; i < ordered.length; i++) {
      await db.quarterProjects.update(ordered[i].id, { priority: i });
    }
  });
}

// ─── component ────────────────────────────────────────────────────────────────

export default function PortfolioDashboardClient() {
  const { quarterId } = useParams<{ quarterId: string }>();

  // drag state — only indices, no copies of data
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // are we dragging the capacity line itself?
  const draggingLineRef = useRef(false);
  const [draggingLine, setDraggingLine] = useState(false);

  const [addingProject, setAddingProject] = useState(false);
  const [newProjectId, setNewProjectId] = useState('');

  const data = useLiveQuery(async () => {
    const [quarter, quarterProjects, projects, people, quarterPeople, subteams, projectRoles, allocations] =
      await Promise.all([
        db.quarters.get(quarterId),
        db.quarterProjects.where('quarterId').equals(quarterId).toArray(),
        db.projects.toArray(),
        db.people.toArray(),
        db.quarterPeople.where('quarterId').equals(quarterId).toArray(),
        db.subteams.toArray(),
        db.projectRoles.where('quarterId').equals(quarterId).toArray(),
        db.allocations.where('quarterId').equals(quarterId).toArray(),
      ]);
    return { quarter, quarterProjects, projects, people, quarterPeople, subteams, projectRoles, allocations };
  }, [quarterId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;

  const { quarter, quarterProjects, projects, people, quarterPeople, subteams, projectRoles, allocations } = data;

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const subteamById = new Map(subteams.map((s) => [s.id, s]));

  const rolesByProject = new Map<string, typeof projectRoles>();
  for (const role of projectRoles) {
    const arr = rolesByProject.get(role.projectId) ?? [];
    arr.push(role);
    rolesByProject.set(role.projectId, arr);
  }

  // Sort by priority (nulls last)
  const sorted = [...quarterProjects].sort((a, b) => {
    if (a.priority === null && b.priority === null) return 0;
    if (a.priority === null) return 1;
    if (b.priority === null) return -1;
    return a.priority - b.priority;
  });

  const capacitySummary = quarter ? getQuarterCapacitySummary(quarter, people, quarterPeople) : null;

  const assignedProjectIds = new Set(quarterProjects.map((qp) => qp.projectId));
  const addableProjects = projects
    .filter((p) => !assignedProjectIds.has(p.id) && p.status !== 'Complete' && p.status !== 'Cancelled')
    .sort((a, b) => a.name.localeCompare(b.name));

  async function addProject() {
    if (!newProjectId) return;
    const project = projects.find((p) => p.id === newProjectId);
    if (!project) return;

    // Find the most recent other quarter that has roles for this project,
    // and copy DRI/EM/PM (not Engineers — capacity is quarter-specific)
    const previousRoles = await db.projectRoles
      .where('projectId').equals(newProjectId)
      .toArray();
    const previousNonEngineerRoles = previousRoles.filter(
      (r) => r.quarterId !== quarterId && r.role !== 'Engineer',
    );
    // Pick the most recent quarter's roles by taking the latest quarterId
    // (quarters are ordered by startDate, so we look up their dates)
    const previousQuarterIds = [...new Set(previousNonEngineerRoles.map((r) => r.quarterId))];
    let rolesToCopy: typeof previousNonEngineerRoles = [];
    if (previousQuarterIds.length > 0) {
      const previousQuarters = await db.quarters.bulkGet(previousQuarterIds);
      const latestQuarter = previousQuarters
        .filter(Boolean)
        .sort((a, b) => (b!.startDate > a!.startDate ? 1 : -1))[0];
      if (latestQuarter) {
        rolesToCopy = previousNonEngineerRoles.filter((r) => r.quarterId === latestQuarter.id);
      }
    }

    await db.transaction('rw', [db.quarterProjects, db.projectRoles], async () => {
      await db.quarterProjects.add({
        id: uid(),
        quarterId,
        projectId: newProjectId,
        status: project.status,
        priority: sorted.length,
        estimatedPersonWeeks: null,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      });
      if (rolesToCopy.length > 0) {
        await db.projectRoles.bulkAdd(
          rolesToCopy.map((r) => ({ ...r, id: uid(), quarterId })),
        );
      }
    });

    setNewProjectId('');
    setAddingProject(false);
  }  const cumulativeEstimatedByProjectId = new Map<string, number>();
  let cumulativeEstimatedPersonWeeks = 0;
  let autoCapacityLineAfter = -1;
  for (let i = 0; i < sorted.length; i++) {
    cumulativeEstimatedPersonWeeks += sorted[i].estimatedPersonWeeks ?? 0;
    cumulativeEstimatedByProjectId.set(sorted[i].id, Number(cumulativeEstimatedPersonWeeks.toFixed(1)));
    if (autoCapacityLineAfter === -1 && capacitySummary && cumulativeEstimatedPersonWeeks >= capacitySummary.totalAvailablePersonWeeks) {
      autoCapacityLineAfter = i;
    }
  }

  // capacityLineAfter: index after which the red zone starts (0-based, so 2 means after row index 2)
  const lineAfter = quarter?.capacityLineAfter ?? autoCapacityLineAfter;

  // ── drag handlers for rows ──────────────────────────────────────────────

  function handleRowDragStart(e: React.DragEvent, index: number) {
    draggingLineRef.current = false;
    setDraggingLine(false);
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleRowDragOver(e: React.DragEvent, index: number) {
    if (draggingLineRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }

  async function handleRowDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    if (draggingLineRef.current) return;
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
    draggingLineRef.current = false;
    setDraggingLine(false);
  }

  // ── drag handlers for the capacity line ────────────────────────────────

  function handleLineDragStart(e: React.DragEvent) {
    draggingLineRef.current = true;
    setDraggingLine(true);
    e.dataTransfer.effectAllowed = 'move';
    // ghost image: tiny transparent element
    const ghost = document.createElement('div');
    ghost.style.width = '1px';
    ghost.style.height = '1px';
    ghost.style.opacity = '0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }

  async function handleLineDropOnRow(e: React.DragEvent, index: number) {
    if (!draggingLineRef.current) return;
    e.preventDefault();
    draggingLineRef.current = false;
    setDraggingLine(false);
    setDragOverIndex(null);
    if (!quarter) return;
    // Drop on row index means line goes AFTER that row
    await db.quarters.update(quarter.id, { capacityLineAfter: index });
  }

  async function handleLineDragOverRow(e: React.DragEvent) {
    if (!draggingLineRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async function moveLineUp() {
    if (!quarter) return;
    const current = quarter.capacityLineAfter ?? sorted.length - 1;
    if (current > 0) await db.quarters.update(quarter.id, { capacityLineAfter: current - 1 });
  }

  async function moveLineDown() {
    if (!quarter) return;
    const current = quarter.capacityLineAfter ?? 0;
    if (current < sorted.length - 1) await db.quarters.update(quarter.id, { capacityLineAfter: current + 1 });
  }

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">Portfolio</h2>
        <div className="flex items-center gap-3">
          {!addingProject && (
            <button
              onClick={() => { setNewProjectId(''); setAddingProject(true); }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8"
            >
              + Add project
            </button>
          )}
          <p className="text-xs text-zinc-500">
            Drag rows to reorder · Drag the capacity line to reposition it
            {capacitySummary && (
              <span className="ml-2 text-zinc-600">
                Total capacity: {capacitySummary.totalAvailablePersonWeeks}pw
              </span>
            )}
          </p>
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
            <span className="text-xs text-zinc-500">All projects are already in this quarter.</span>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          title="No projects in this quarter"
          description="Add projects to this quarter to start planning."
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
                const roles = rolesByProject.get(project.id) ?? [];
                const dri = roles.find((r) => r.role === 'DRI');
                const em = roles.find((r) => r.role === 'EM');
                const pm = roles.find((r) => r.role === 'PM');
                const subteam = project.owningSubteamId ? subteamById.get(project.owningSubteamId) : null;
                const capacity = quarter
                  ? getProjectCapacitySummary({
                    projectId: project.id,
                    quarter,
                    estimatedPersonWeeks: qp.estimatedPersonWeeks,
                    people,
                    quarterPeople,
                    activeProjectRoles: projectRoles,
                    activeAllocations: allocations,
                  })
                  : null;
                const cumulative = cumulativeEstimatedByProjectId.get(qp.id) ?? 0;
                const isOverCapacity = capacitySummary !== null && cumulative > capacitySummary.totalAvailablePersonWeeks;
                const remainingCapacity = capacitySummary
                  ? Number((capacitySummary.totalAvailablePersonWeeks - cumulative).toFixed(1))
                  : null;

                const isAboveLine = lineAfter === null || index <= lineAfter;
                const isDragTarget = dragOverIndex === index && !draggingLine;

                // The capacity line divider renders AFTER this row
                const showLineAfterRow = lineAfter !== null && index === lineAfter;

                return (
                  <React.Fragment key={qp.id}>
                    <tr
                      draggable
                      onDragStart={(e) => handleRowDragStart(e, index)}
                      onDragOver={(e) => {
                        handleRowDragOver(e, index);
                        handleLineDragOverRow(e);
                      }}
                      onDrop={(e) => {
                        handleRowDrop(e, index);
                        handleLineDropOnRow(e, index);
                      }}
                      onDragEnd={handleDragEnd}
                      className={[
                        'group transition-colors',
                        isOverCapacity
                          ? 'bg-rose-950/20 hover:bg-rose-950/30'
                          : isAboveLine
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
                          onSave={(value) => db.quarterProjects.update(qp.id, { estimatedPersonWeeks: value })}
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
                      <td className={`py-3 pr-4 tabular-nums ${isOverCapacity ? 'text-rose-400' : 'text-zinc-200'}`}>
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
                          <div
                            draggable
                            onDragStart={handleLineDragStart}
                            onDragEnd={handleDragEnd}
                            className="group relative flex cursor-ns-resize items-center gap-2 border-y border-rose-500/60 bg-rose-500/10 px-3 py-1 hover:bg-rose-500/20"
                            title="Drag to move the capacity line"
                          >
                            <span className="text-xs font-semibold text-rose-400 uppercase tracking-widest">
                              ↑ capacity ends here · no capacity ↓
                            </span>
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                onClick={moveLineUp}
                                className="rounded px-1.5 py-0.5 text-xs text-rose-400 hover:bg-rose-500/20 hover:text-rose-200"
                                title="Move line up"
                              >
                                ↑
                              </button>
                              <button
                                onClick={moveLineDown}
                                className="rounded px-1.5 py-0.5 text-xs text-rose-400 hover:bg-rose-500/20 hover:text-rose-200"
                                title="Move line down"
                              >
                                ↓
                              </button>
                            </div>
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
