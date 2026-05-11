'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { InlineEditText } from '@/components/ui/InlineEdit';
import {
  addProjectLink as createProjectLink,
  addProjectMember,
  addProjectRisk as createProjectRisk,
  addProjectUnknown as createProjectUnknown,
  deleteProjectCascade,
  getProjectMemberAllocationMax,
  getProjectPageData,
  removeProjectLink as deleteProjectLink,
  removeProjectMember,
  toggleProjectRiskMitigated as setProjectRiskMitigated,
  toggleProjectUnknownResolved as setProjectUnknownResolved,
  updateProjectDescription,
  updateProjectName,
  updateProjectStatus,
  updateProjectTags,
} from '@/lib/projects';
import {
  getAssignableEngineers,
  getPersonRemainingAllocationPct,
  getQuarterPersonProjectSummary,
  personTracksCapacity,
} from '@/lib/person-capacity';
import { getActiveQuarter } from '@/lib/quarters';
import { projectHealthMeta, buildProjectHealthMap, getOverAllocatedProjectIds } from '@/lib/project-health';
import { getProjectTags } from '@/lib/project-tags';
import { Badge } from '@/components/ui/Badge';
import type { ProjectStatus, QuarterPerson, QuarterStatus, RiskImpact, RiskLikelihood, Role } from '@/lib/types';

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'Proposed', label: 'Proposed' },
  { value: 'Active', label: 'Active' },
  { value: 'On Hold', label: 'On Hold' },
  { value: 'Complete', label: 'Complete' },
  { value: 'Cancelled', label: 'Cancelled' },
];

const ALL_ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'DRI', label: 'DRI' },
  { value: 'Engineer', label: 'Engineer' },
  { value: 'EM', label: 'EM' },
  { value: 'PM', label: 'PM' },
  { value: 'Stakeholder', label: 'Stakeholder' },
];

const RISK_LEVEL_OPTIONS: Array<{ value: RiskLikelihood | RiskImpact; label: string }> = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
];

function TagsEditor({ tags, onSave }: { tags: string[]; onSave: (val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  function start() {
    setDraft(tags.join(', '));
    setEditing(true);
  }

  function commit() {
    onSave(draft);
    setEditing(false);
  }

  useEffect(() => {
    if (editing) { ref.current?.focus(); ref.current?.select(); }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder="platform, infra, …"
        className="w-full rounded border border-sky-400/40 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={start}
      onKeyDown={(e) => e.key === 'Enter' && start()}
      title="Click to edit tags"
      className="flex flex-wrap gap-1.5 rounded px-0.5 -mx-0.5 cursor-text hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-sky-400/40 transition-colors min-h-[24px] items-center"
    >
      {tags.length > 0
        ? tags.map((tag) => (
            <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
              #{tag}
            </span>
          ))
        : <span className="text-xs text-zinc-600 italic">+ add tags</span>
      }
    </div>
  );
}

export default function ProjectPageClient() {
  const { projectId } = useParams<{ projectId: string }>();
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberRole, setNewMemberRole] = useState<Role>('Engineer');
  const [newMemberPersonId, setNewMemberPersonId] = useState('');
  const [newMemberPercentage, setNewMemberPercentage] = useState<number>(100);
  const [showHistory, setShowHistory] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [addingUnknown, setAddingUnknown] = useState(false);
  const [newUnknownTitle, setNewUnknownTitle] = useState('');
  const [newUnknownDescription, setNewUnknownDescription] = useState('');
  const [addingRisk, setAddingRisk] = useState(false);
  const [newRiskTitle, setNewRiskTitle] = useState('');
  const [newRiskMitigation, setNewRiskMitigation] = useState('');
  const [newRiskLikelihood, setNewRiskLikelihood] = useState<RiskLikelihood>('Medium');
  const [newRiskImpact, setNewRiskImpact] = useState<RiskImpact>('Medium');

  const data = useLiveQuery(async () => {
    return getProjectPageData(projectId);
  }, [projectId]);

  const project = data?.project ?? null;
  const projects = data?.projects ?? [];
  const people = data?.people ?? [];
  const subteams = data?.subteams ?? [];
  const quarters = data?.quarters ?? [];
  const allocations = data?.allocations ?? [];
  const quarterPeople = data?.quarterPeople ?? [];
  const quarterProjects = data?.quarterProjects ?? [];
  const activeQuarter = getActiveQuarter(quarters);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const projectSubteam = project ? (subteams.find((subteam) => subteam.id === project.subteamId) ?? null) : null;
  const projectAllocations = project ? allocations.filter((allocation) => allocation.projectId === project.id) : [];

  const currentAllocations = projectAllocations.filter((allocation) => allocation.endDate === null);
  const historicalAllocations = projectAllocations.filter((allocation) => allocation.endDate !== null);
  const historicalProjectRoles = historicalAllocations.filter((allocation) => allocation.role === 'EM' || allocation.role === 'PM' || allocation.role === 'Stakeholder');

  // People already on the project (current allocations)
  const currentMemberPersonIds = new Set(currentAllocations.map((a) => a.personId));

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!project) return <div className="text-sm text-zinc-400">Project not found.</div>;
  const resolvedProject = project;
  const showCompletedProjectHistoryInline = resolvedProject.status === 'Complete';
  const visibleTeamAllocations = showCompletedProjectHistoryInline ? projectAllocations : currentAllocations;
  const overAllocatedProjectIds = activeQuarter
    ? getOverAllocatedProjectIds({ quarter: activeQuarter, people, quarterPeople, allocations })
    : undefined;
  const healthMap = buildProjectHealthMap([resolvedProject], undefined, undefined, overAllocatedProjectIds);
  const health = healthMap.get(resolvedProject.id);
  const healthMeta = health ? projectHealthMeta[health] : null;
  const tags = getProjectTags(resolvedProject);
  const associatedQuarters = quarterProjects
    .map((quarterProject) => {
      const quarter = quarters.find((entry) => entry.id === quarterProject.quarterId);
      return quarter ? { quarter, quarterProject } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.quarter.startDate.localeCompare(b.quarter.startDate));

  // Engineers/DRIs with actual remaining capacity in the active quarter
  const assignableEngineerIds = activeQuarter
    ? new Set(getAssignableEngineers(people, quarterPeople, activeQuarter, allocations).map((p) => p.id))
    : new Set(people.filter((p) => {
        if (!personTracksCapacity(p.role)) return false;
        const totalAllocated = allocations.filter((a) => a.personId === p.id && a.endDate === null && a.percentage > 0).reduce((sum, a) => sum + a.percentage, 0);
        return totalAllocated < p.defaultCapacity;
      }).map((p) => p.id));

  // Role-aware addable people list
  const addableForRole = (role: Role) => people.filter((person) => {
    if (currentMemberPersonIds.has(person.id)) return false;
    if (role === 'Engineer' || role === 'DRI') {
      return assignableEngineerIds.has(person.id);
    }
    return person.role === role;
  });

  // Helper: get remaining capacity % for a person.
  // Uses the active quarter if available; falls back to defaultCapacity minus explicit allocations.
  function getPersonRemainingPct(personId: string): number | null {
    const person = peopleById.get(personId);
    if (!person || !personTracksCapacity(person.role)) return null;

    if (activeQuarter) {
      const qp = quarterPeople.find((e) => e.personId === personId && e.quarterId === activeQuarter.id) as QuarterPerson | undefined;
      return getPersonRemainingAllocationPct({
        person,
        quarterPerson: qp,
        quarterId: activeQuarter.id,
        allocations,
      });
    }

    // No active quarter — subtract explicit active allocations from defaultCapacity
    const activePersonAllocs = allocations.filter((a) => a.personId === personId && a.endDate === null && a.percentage > 0);
    const totalAllocated = activePersonAllocs.reduce((sum, a) => sum + a.percentage, 0);
    return Math.max(0, person.defaultCapacity - totalAllocated);
  }

  function getCapacitySummary(personId: string) {
    if (!activeQuarter) return null;
    const person = peopleById.get(personId);
    if (!person || !personTracksCapacity(person.role)) return null;
    const qp = quarterPeople.find((entry) => entry.personId === personId && entry.quarterId === activeQuarter.id) as QuarterPerson | undefined;
    return getQuarterPersonProjectSummary(activeQuarter, person, qp, allocations);
  }

  async function saveProjectStatus(status: ProjectStatus) {
    await updateProjectStatus(resolvedProject.id, status);
  }

  async function addMember() {
    if (!newMemberPersonId) return;
    await addProjectMember({
      activeQuarter: activeQuarter ?? null,
      allocations,
      personId: newMemberPersonId,
      people,
      percentage: newMemberPercentage,
      project: resolvedProject,
      projects,
      quarterPeople,
      role: newMemberRole,
    });

    setNewMemberPersonId('');
    setNewMemberPercentage(100);
    setAddingMember(false);
  }

  async function removeMember(personId: string, role: Role) {
    await removeProjectMember({
      allocations,
      currentProjectAllocations: currentAllocations,
      personId,
      project: resolvedProject,
      projects,
      role,
    });
  }

  async function addProjectLink() {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    await createProjectLink(resolvedProject, newLinkLabel, newLinkUrl);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setAddingLink(false);
  }

  async function removeProjectLink(linkId: string) {
    await deleteProjectLink(resolvedProject, linkId);
  }

  async function addProjectUnknown() {
    if (!activeQuarter || !newUnknownTitle.trim()) return;
    await createProjectUnknown({
      activeQuarter,
      description: newUnknownDescription,
      project: resolvedProject,
      title: newUnknownTitle,
    });
    setNewUnknownTitle('');
    setNewUnknownDescription('');
    setAddingUnknown(false);
  }

  async function toggleUnknownResolved(unknownId: string, resolved: boolean) {
    await setProjectUnknownResolved(resolvedProject, unknownId, resolved);
  }

  async function addProjectRisk() {
    if (!activeQuarter || !newRiskTitle.trim()) return;
    await createProjectRisk({
      activeQuarter,
      impact: newRiskImpact,
      likelihood: newRiskLikelihood,
      mitigationNote: newRiskMitigation,
      project: resolvedProject,
      title: newRiskTitle,
    });
    setNewRiskTitle('');
    setNewRiskMitigation('');
    setNewRiskLikelihood('Medium');
    setNewRiskImpact('Medium');
    setAddingRisk(false);
  }

  async function toggleRiskMitigated(riskId: string, mitigated: boolean) {
    await setProjectRiskMitigated(resolvedProject, riskId, mitigated);
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All projects
      </Link>

      {/* ── Header card ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <InlineEditText
              value={resolvedProject.name}
              onSave={(value) => updateProjectName(resolvedProject.id, value)}
              className="text-2xl font-bold text-zinc-50"
            />
            <div className="flex flex-wrap items-center gap-2">
              {healthMeta && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${healthMeta.pillClassName}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${healthMeta.dotBg}`} />
                  {healthMeta.label}
                </span>
              )}
              {projectSubteam && (
                <span className="text-xs text-zinc-500">{projectSubteam.name}</span>
              )}
            </div>

            {/* Tags — click to edit as comma-separated text */}
            <TagsEditor
              tags={tags}
              onSave={(val) => updateProjectTags(resolvedProject.id, val)}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={resolvedProject.status}
              onChange={(e) => saveProjectStatus(e.target.value as ProjectStatus)}
              className="h-7 rounded-lg border border-white/10 bg-zinc-900 px-2 py-0 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => deleteProjectCascade(resolvedProject.id, resolvedProject.subteamId)}
              className="h-7 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 text-xs text-rose-300 hover:bg-rose-500/20 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="border-t border-white/5 pt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.15em] text-zinc-600">Description</p>
          <InlineEditText
            value={resolvedProject.description}
            onSave={(value) => updateProjectDescription(resolvedProject.id, value)}
            multiline
            placeholder="Add a description…"
            className="text-sm text-zinc-300 leading-relaxed"
          />
        </div>
      </div>

      {/* ── Team section ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Team</h2>
          <button
            onClick={() => { setAddingMember((v) => !v); setNewMemberPersonId(''); }}
            className="text-xs text-sky-400 hover:text-sky-200 transition-colors"
          >
            {addingMember ? 'Cancel' : '+ Add person'}
          </button>
        </div>

        {/* Add-member form */}
        {addingMember && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-500">Role</label>
              <select
                value={newMemberRole}
                onChange={(e) => {
                  setNewMemberRole(e.target.value as Role);
                  setNewMemberPersonId('');
                  setNewMemberPercentage(100);
                }}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
              >
                {ALL_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-[11px] text-zinc-500">Person</label>
              <select
                value={newMemberPersonId}
                onChange={(e) => {
                  const personId = e.target.value;
                  setNewMemberPersonId(personId);
                  if (personId && (newMemberRole === 'Engineer' || newMemberRole === 'DRI')) {
                    const remaining = getPersonRemainingPct(personId);
                    setNewMemberPercentage(remaining !== null ? Math.max(1, remaining) : 100);
                  }
                }}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
              >
                <option value="">Select person…</option>
                {addableForRole(newMemberRole).map((person) => {
                  const remaining = personTracksCapacity(person.role) ? getPersonRemainingPct(person.id) : null;
                  const capLabel = remaining !== null ? ` · ${remaining}% free` : '';
                  return (
                    <option key={person.id} value={person.id}>
                      {person.name}{capLabel}
                    </option>
                  );
                })}
              </select>
            </div>
            {(newMemberRole === 'Engineer' || newMemberRole === 'DRI') && (() => {
              const selectedPerson = peopleById.get(newMemberPersonId);
              const maxPct = selectedPerson && activeQuarter
                ? Math.max(1, getProjectMemberAllocationMax({
                  allocations,
                  person: selectedPerson,
                  projectId: resolvedProject.id,
                  quarterId: activeQuarter.id,
                  quarterPeople,
                }))
                : newMemberPersonId ? Math.max(1, getPersonRemainingPct(newMemberPersonId) ?? 100) : 100;
              return (
                <div className="flex flex-col gap-1 w-20">
                  <label className="text-[11px] text-zinc-500">% <span className="text-zinc-600">(max {maxPct})</span></label>
                  <input
                    type="number"
                    min={1}
                    max={maxPct}
                    value={newMemberPercentage}
                    onChange={(e) => setNewMemberPercentage(Math.min(maxPct, Math.max(1, Number(e.target.value))))}
                    className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
                  />
                </div>
              );
            })()}
            <button
              onClick={addMember}
              disabled={!newMemberPersonId}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
        )}

        {/* Current roster */}
        {visibleTeamAllocations.length === 0 ? (
          <p className="text-sm text-zinc-500">No team members yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {visibleTeamAllocations.map((alloc) => {
              const person = peopleById.get(alloc.personId);
              if (!person) return null;
              const isHistoricalAllocation = alloc.endDate !== null;
              const cap = !isHistoricalAllocation && (alloc.role === 'Engineer' || alloc.role === 'DRI') ? getCapacitySummary(person.id) : null;
              const initials = person.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div key={alloc.id} className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 hover:border-white/10 transition-colors">
                  {/* Avatar */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">{person.name}</span>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                        {alloc.role}
                      </span>
                    </div>
                    {isHistoricalAllocation && showCompletedProjectHistoryInline ? (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {alloc.startDate ?? '—'} → {alloc.endDate ?? '—'}
                      </p>
                    ) : cap && (
                      <p className={`mt-0.5 text-xs ${cap.overAllocated ? 'text-rose-400' : 'text-zinc-500'}`}>
                        {cap.overAllocated
                          ? `Over capacity · 0w free`
                          : `${Math.max(0, cap.remainingWeeks)}w free · ${cap.totalAllocatedPct}% allocated`}
                      </p>
                    )}
                  </div>
                  {!isHistoricalAllocation && (
                    <button
                      onClick={() => removeMember(person.id, alloc.role)}
                      className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded-full text-zinc-600 hover:bg-rose-900/40 hover:text-rose-400 transition-colors text-xs"
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* History */}
        {!showCompletedProjectHistoryInline && historicalAllocations.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <span className={`transition-transform ${showHistory ? 'rotate-90' : ''}`}>▶</span>
            {showHistory ? 'Hide history' : 'Show history'}
          </button>
        )}

        {showHistory && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-600">Past members</p>
            {historicalAllocations.map((alloc) => (
              <div key={alloc.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-xs text-zinc-500">
                <span className="font-medium text-zinc-400">{peopleById.get(alloc.personId)?.name ?? 'Unknown'}</span>
                <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px]">{alloc.role}</span>
                <span className="ml-auto">{alloc.startDate ?? '—'} → {alloc.endDate ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Quarters ─────────────────────────────────────────────── */}
      {associatedQuarters.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200">Quarters</h2>
          <div className="space-y-2">
            {[...associatedQuarters].reverse().map(({ quarter, quarterProject }) => {
              const statusVariant: Record<QuarterStatus, 'success' | 'info' | 'neutral' | 'warning'> = {
                active: 'success',
                draft: 'info',
                closed: 'neutral',
                archived: 'warning',
              };
              const statusLabel: Record<QuarterStatus, string> = {
                active: 'Active',
                draft: 'Upcoming',
                closed: 'Closed',
                archived: 'Archived',
              };
              const hasMeta = quarterProject.priority !== null
                || quarterProject.estimatedPersonWeeks !== null
                || quarterProject.targetMilestone
                || quarterProject.notes;
              return (
                <div
                  key={quarterProject.id}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-3 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link
                      href={`/quarters/${quarter.id}`}
                      className="text-sm font-semibold text-zinc-100 hover:text-sky-200 transition-colors"
                    >
                      {quarter.name}
                    </Link>
                    <Badge variant={statusVariant[quarter.status]}>
                      {statusLabel[quarter.status]}
                    </Badge>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {quarter.startDate} – {quarter.endDate}
                    </span>
                    {quarterProject.priority !== null && (
                      <span className="ml-auto text-xs text-zinc-500">
                        Priority <span className="font-semibold text-zinc-300">#{quarterProject.priority + 1}</span>
                      </span>
                    )}
                  </div>
                  {hasMeta && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-0.5">
                      {quarterProject.estimatedPersonWeeks !== null && (
                        <span className="text-xs text-zinc-500">
                          Estimate{' '}
                          <span className="font-medium text-zinc-300">
                            {quarterProject.estimatedPersonWeeks}pw
                          </span>
                        </span>
                      )}
                      {quarterProject.targetMilestone && (
                        <span className="text-xs text-zinc-500">
                          Milestone{' '}
                          <span className="font-medium text-zinc-300">
                            {quarterProject.targetMilestone}
                          </span>
                        </span>
                      )}
                      {quarterProject.notes && (
                        <span className="text-xs text-zinc-400 italic">{quarterProject.notes}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Links ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Links</h2>
          <button
            onClick={() => { setAddingLink((v) => !v); setNewLinkLabel(''); setNewLinkUrl(''); }}
            className="text-xs text-sky-400 hover:text-sky-200 transition-colors"
          >
            {addingLink ? 'Cancel' : '+ Add link'}
          </button>
        </div>

        {resolvedProject.links.length > 0 && (
          <div className="space-y-2">
            {resolvedProject.links.map((link) => (
              <div key={link.id} className="group flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 hover:border-white/10 transition-colors">
                <div className="min-w-0">
                  <a href={link.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-sky-300 hover:text-sky-200 transition-colors">
                    {link.label}
                  </a>
                  <p className="mt-0.5 truncate text-xs text-zinc-600">{link.url}</p>
                </div>
                <button
                  onClick={() => removeProjectLink(link.id)}
                  className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded-full text-zinc-600 hover:bg-rose-900/40 hover:text-rose-400 transition-colors text-xs shrink-0"
                  title="Remove link"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {addingLink && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-500">Label</label>
              <input
                value={newLinkLabel}
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="Design doc"
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-[11px] text-zinc-500">URL</label>
              <input
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addProjectLink(); }}
                placeholder="https://…"
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
              />
            </div>
            <button
              onClick={addProjectLink}
              disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add link
            </button>
          </div>
        )}
      </section>

      {/* ── Unknowns ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Unknowns</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              {resolvedProject.unknowns.filter((u) => !u.resolved).length} open
            </span>
            <button
              onClick={() => { setAddingUnknown((v) => !v); setNewUnknownTitle(''); setNewUnknownDescription(''); }}
              className="text-xs text-sky-400 hover:text-sky-200 transition-colors"
            >
              {addingUnknown ? 'Cancel' : '+ Add unknown'}
            </button>
          </div>
        </div>

        {resolvedProject.unknowns.length > 0 && (
          <div className="space-y-2">
            {resolvedProject.unknowns.map((unknown) => (
              <div
                key={unknown.id}
                className={`rounded-xl border p-3 transition-colors ${
                  unknown.resolved
                    ? 'border-white/5 bg-white/[0.01] opacity-60'
                    : 'border-amber-400/10 bg-amber-400/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {!unknown.resolved && (
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    )}
                    <p className={`text-sm font-medium ${unknown.resolved ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                      {unknown.title}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleUnknownResolved(unknown.id, !unknown.resolved)}
                    className="shrink-0 text-xs text-zinc-500 hover:text-sky-300 transition-colors"
                  >
                    {unknown.resolved ? 'Reopen' : 'Resolve'}
                  </button>
                </div>
                {unknown.description && (
                  <p className="mt-1.5 text-sm text-zinc-400 pl-3.5">{unknown.description}</p>
                )}
                <p className="mt-1.5 text-xs text-zinc-600 pl-3.5">
                  {unknown.resolved
                    ? `Resolved ${unknown.resolvedAt?.slice(0, 10) ?? ''}`
                    : `Added ${unknown.createdAt.slice(0, 10)}`}
                </p>
              </div>
            ))}
          </div>
        )}

        {addingUnknown && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <input
              value={newUnknownTitle}
              onChange={(e) => setNewUnknownTitle(e.target.value)}
              placeholder="What's unclear?"
              className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
            />
            <textarea
              value={newUnknownDescription}
              onChange={(e) => setNewUnknownDescription(e.target.value)}
              placeholder="Details (optional)"
              rows={2}
              className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50 resize-none"
            />
            <button
              onClick={addProjectUnknown}
              disabled={!newUnknownTitle.trim() || !activeQuarter}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
            {!activeQuarter && (
              <p className="text-xs text-zinc-600">No active quarter — unknowns require one.</p>
            )}
          </div>
        )}
      </section>

      {/* ── Risks ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Risks</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              {resolvedProject.risks.filter((r) => !r.mitigated).length} open
            </span>
            <button
              onClick={() => { setAddingRisk((v) => !v); setNewRiskTitle(''); setNewRiskMitigation(''); setNewRiskLikelihood('Medium'); setNewRiskImpact('Medium'); }}
              className="text-xs text-sky-400 hover:text-sky-200 transition-colors"
            >
              {addingRisk ? 'Cancel' : '+ Add risk'}
            </button>
          </div>
        </div>

        {resolvedProject.risks.length > 0 && (
          <div className="space-y-2">
            {resolvedProject.risks.map((risk) => {
              const isHigh = risk.likelihood === 'High' || risk.impact === 'High';
              const isMed = !isHigh && (risk.likelihood === 'Medium' || risk.impact === 'Medium');
              const dotColor = risk.mitigated ? 'bg-zinc-600' : isHigh ? 'bg-rose-500' : isMed ? 'bg-amber-400' : 'bg-emerald-400';
              const borderColor = risk.mitigated
                ? 'border-white/5'
                : isHigh ? 'border-rose-500/15' : isMed ? 'border-amber-400/10' : 'border-emerald-400/10';
              const bgColor = risk.mitigated
                ? 'bg-white/[0.01]'
                : isHigh ? 'bg-rose-500/[0.03]' : isMed ? 'bg-amber-400/[0.03]' : 'bg-emerald-400/[0.03]';
              return (
                <div
                  key={risk.id}
                  className={`rounded-xl border p-3 transition-colors ${borderColor} ${bgColor} ${risk.mitigated ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${risk.mitigated ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                          {risk.title}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                            risk.likelihood === 'High' && !risk.mitigated
                              ? 'border-rose-400/20 text-rose-300'
                              : risk.likelihood === 'Medium' && !risk.mitigated
                              ? 'border-amber-400/20 text-amber-300'
                              : 'border-white/10 text-zinc-500'
                          }`}>
                            {risk.likelihood} likelihood
                          </span>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                            risk.impact === 'High' && !risk.mitigated
                              ? 'border-rose-400/20 text-rose-300'
                              : risk.impact === 'Medium' && !risk.mitigated
                              ? 'border-amber-400/20 text-amber-300'
                              : 'border-white/10 text-zinc-500'
                          }`}>
                            {risk.impact} impact
                          </span>
                        </div>
                        {risk.mitigationNote && (
                          <p className="mt-1.5 text-xs text-zinc-400">{risk.mitigationNote}</p>
                        )}
                        <p className="mt-1 text-xs text-zinc-600">
                          {risk.mitigated
                            ? `Mitigated ${risk.mitigatedAt?.slice(0, 10) ?? ''}`
                            : `Added ${risk.createdAt.slice(0, 10)}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRiskMitigated(risk.id, !risk.mitigated)}
                      className="shrink-0 text-xs text-zinc-500 hover:text-sky-300 transition-colors"
                    >
                      {risk.mitigated ? 'Reopen' : 'Mitigate'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {addingRisk && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <input
              value={newRiskTitle}
              onChange={(e) => setNewRiskTitle(e.target.value)}
              placeholder="What could go wrong?"
              className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
            />
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-500">Likelihood</label>
                <select
                  value={newRiskLikelihood}
                  onChange={(e) => setNewRiskLikelihood(e.target.value as RiskLikelihood)}
                  className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
                >
                  {RISK_LEVEL_OPTIONS.map((opt) => (
                    <option key={`l-${opt.value}`} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-500">Impact</label>
                <select
                  value={newRiskImpact}
                  onChange={(e) => setNewRiskImpact(e.target.value as RiskImpact)}
                  className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
                >
                  {RISK_LEVEL_OPTIONS.map((opt) => (
                    <option key={`i-${opt.value}`} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <textarea
              value={newRiskMitigation}
              onChange={(e) => setNewRiskMitigation(e.target.value)}
              placeholder="Mitigation plan (optional)"
              rows={2}
              className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/50 resize-none"
            />
            <button
              onClick={addProjectRisk}
              disabled={!newRiskTitle.trim() || !activeQuarter}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
            {!activeQuarter && (
              <p className="text-xs text-zinc-600">No active quarter — risks require one.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
