'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/lib/db';
import { InlineEditNumber, InlineEditText, InlineEditSelect } from '@/components/ui/InlineEdit';
import type { ProjectStatus, ProjectRoleType, RiskLikelihood, RiskImpact } from '@/lib/types';
import {
  getDefaultProjectRoleType,
  getAssignablePeopleForProjectRole,
  getEditableProjectRoleOptions,
  getPersonProjectCapacityShare,
  getPersonProjectCapacityShares,
  getProjectRoleOptions,
  personNeedsProjectCapacity,
  planQuarterProjectAllocation,
  planAddProjectRole, planProjectRolePersonChange, planProjectRoleTypeChange, type ProjectTeamMutationPlan,
} from '@/lib/project-team';
import { getProjectCapacitySummary, getAssignableEngineers } from '@/lib/quarter-capacity';
import { computeProjectHealth } from '@/lib/project-health';

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'Proposed',  label: 'Proposed'  },
  { value: 'Active',    label: 'Active'    },
  { value: 'On Hold',   label: 'On Hold'   },
  { value: 'Complete',  label: 'Complete'  },
  { value: 'Cancelled', label: 'Cancelled' },
];

const ROLE_OPTIONS: { value: ProjectRoleType; label: string }[] = [
  { value: 'DRI',      label: 'DRI'      },
  { value: 'Engineer', label: 'Engineer' },
  { value: 'EM',       label: 'EM'       },
  { value: 'PM',       label: 'PM'       },
];

const LIKELIHOOD_OPTIONS: { value: RiskLikelihood; label: string }[] = [
  { value: 'Low', label: 'Low' }, { value: 'Medium', label: 'Medium' }, { value: 'High', label: 'High' },
];
const IMPACT_OPTIONS: { value: RiskImpact; label: string }[] = [
  { value: 'Low', label: 'Low' }, { value: 'Medium', label: 'Medium' }, { value: 'High', label: 'High' },
];

function uid() { return crypto.randomUUID(); }
export default function ProjectPageClient() {
  const { projectId } = useParams<{ projectId: string }>();

  // new-item form state
  const [addingRole, setAddingRole]       = useState(false);
  const [newRoleType, setNewRoleType]     = useState<ProjectRoleType>('DRI');
  const [newRolePersonId, setNewRolePersonId] = useState('');
  const [newRoleCapacity, setNewRoleCapacity] = useState(100);
  const [addingStakeholder, setAddingStakeholder] = useState(false);
  const [newStakeholderPersonId, setNewStakeholderPersonId] = useState('');

  const [addingLink, setAddingLink]       = useState(false);
  const [newLinkLabel, setNewLinkLabel]   = useState('');
  const [newLinkUrl, setNewLinkUrl]       = useState('');

  const [addingUnknown, setAddingUnknown] = useState(false);
  const [newUnknownTitle, setNewUnknownTitle] = useState('');
  const [newUnknownDesc, setNewUnknownDesc]   = useState('');

  const [addingRisk, setAddingRisk]       = useState(false);
  const [newRiskTitle, setNewRiskTitle]   = useState('');
  const [newRiskLikelihood, setNewRiskLikelihood] = useState<RiskLikelihood>('Medium');
  const [newRiskImpact, setNewRiskImpact] = useState<RiskImpact>('Medium');
  const [newRiskNote, setNewRiskNote]     = useState('');

  const data = useLiveQuery(async () => {
    const [project, people, subteams, allQuarters, allProjectRoles, projectStakeholders, quarterPeople, projectLinks, unknowns, risks, allocations, allQuarterProjects] =
      await Promise.all([
        db.projects.get(projectId),
        db.people.orderBy('name').toArray(),
        db.subteams.toArray(),
        db.quarters.orderBy('startDate').reverse().toArray(),
        db.projectRoles.toArray(),
        db.projectStakeholders.where('projectId').equals(projectId).toArray(),
        db.quarterPeople.toArray(),
        db.projectLinks.where('projectId').equals(projectId).toArray(),
        db.unknowns.where('projectId').equals(projectId).toArray(),
        db.risks.where('projectId').equals(projectId).toArray(),
        db.allocations.toArray(),
        db.quarterProjects.where('projectId').equals(projectId).toArray(),
      ]);
    return { project, people, subteams, allQuarters, allProjectRoles, projectStakeholders, quarterPeople, projectLinks, unknowns, risks, allocations, allQuarterProjects };
  }, [projectId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!data.project) return <div className="text-sm text-zinc-400">Project not found.</div>;

  const { project, people, subteams, allQuarters, allProjectRoles, projectStakeholders, quarterPeople, projectLinks, unknowns, risks, allocations, allQuarterProjects } = data;
  const activeQuarter = allQuarters.find((q) => q.status === 'active') ?? null;
  const activeQuarterId = activeQuarter?.id ?? null;
  const activeProjectRoles = activeQuarterId
    ? allProjectRoles.filter((role) => role.quarterId === activeQuarterId)
    : allProjectRoles;
  const projectRoles = activeProjectRoles.filter((role) => role.projectId === projectId);
  const activeAllocations = activeQuarterId
    ? allocations.filter((allocation) => allocation.quarterId === activeQuarterId)
    : allocations;

  // Quarters that have a QuarterProject entry for this project, sorted newest first
  const projectQuarterIds = new Set(allQuarterProjects.map((qp) => qp.quarterId));
  const assignedQuarters = allQuarters.filter((q) => projectQuarterIds.has(q.id));

  // Per-quarter capacity summaries
  const quarterCapacitySummaries = assignedQuarters.map((quarter) => {
    const qp = allQuarterProjects.find((q) => q.quarterId === quarter.id);
    const qProjectRoles = allProjectRoles.filter((r) => r.quarterId === quarter.id);
    const qAllocations = allocations.filter((a) => a.quarterId === quarter.id);
    const summary = getProjectCapacitySummary({
      projectId,
      quarter,
      estimatedPersonWeeks: qp?.estimatedPersonWeeks ?? null,
      people,
      quarterPeople,
      activeProjectRoles: qProjectRoles,
      activeAllocations: qAllocations,
    });
    return { quarter, quarterProject: qp ?? null, summary };
  });

  const openUnknowns = unknowns.filter((u) => !u.resolved).length;
  const openRisks    = risks.filter((r) => !r.mitigated).length;
  const health = computeProjectHealth(unknowns, risks);

  const roleOrder: ProjectRoleType[] = ['DRI', 'EM', 'PM', 'Engineer'];
  const sortedRoles = [...projectRoles].sort((a, b) => {
    const ai = roleOrder.indexOf(a.role); const bi = roleOrder.indexOf(b.role);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const currentDri = projectRoles.find((role) => role.role === 'DRI');
  const projectSubteam = project.owningSubteamId
    ? subteams.find((subteam) => subteam.id === project.owningSubteamId) ?? null
    : null;
  const addRoleOptions = ROLE_OPTIONS.filter((option) =>
    getProjectRoleOptions(projectRoles).includes(option.value),
  );
  const assignableEngineers = activeQuarter
    ? new Set(getAssignableEngineers(people, quarterPeople, activeQuarter, activeProjectRoles, activeAllocations).map((p) => p.id))
    : null;

  const addablePeople = getAssignablePeopleForProjectRole(people, projectRoles, newRoleType).filter((p) => {
    if (newRoleType !== 'Engineer') return true;
    if (!assignableEngineers) return true;
    return assignableEngineers.has(p.id);
  });

  function getRemainingCapacity(personId: string): number {
    const person = people.find((p) => p.id === personId);
    if (!person) return 100;
    const assignedProjectIds = activeProjectRoles
      .filter((r) => r.personId === personId)
      .map((r) => r.projectId);
    if (assignedProjectIds.length === 0) return person.defaultCapacity;
    const personAllocations = activeAllocations.filter((a) => a.personId === personId);
    const shares = getPersonProjectCapacityShares(
      personId,
      person.defaultCapacity,
      assignedProjectIds,
      activeProjectRoles,
      personAllocations,
    );
    const totalAllocated = shares.reduce((sum, s) => sum + s.percentage, 0);
    return Math.max(0, person.defaultCapacity - totalAllocated);
  }

  // ── project field saves ──────────────────────────────────────────────────
  const saveProject = (patch: Partial<typeof project>) =>
    db.projects.update(projectId, patch);

  function buildProjectTeamContext() {
    return { activeQuarterId, people, project, projectRoles, quarterPeople, subteams };
  }

  async function applyProjectTeamMutationPlan(plan: ProjectTeamMutationPlan) {
    if (plan.roleToCreate) {
      await db.projectRoles.add(plan.roleToCreate);
    }
    if (plan.roleUpdate) {
      await db.projectRoles.update(plan.roleUpdate.roleId, plan.roleUpdate.patch);
    }
    if (plan.subteamToCreate) {
      await db.subteams.add(plan.subteamToCreate);
    }
    if (plan.subteamToUpdate) {
      await db.subteams.update(plan.subteamToUpdate.id, plan.subteamToUpdate.patch);
    }
    if (plan.projectPatch) {
      await db.projects.update(projectId, plan.projectPatch);
    }
    for (const update of plan.peopleUpdates) {
      await db.people.update(update.personId, { subteamId: update.subteamId });
    }
    for (const update of plan.quarterPeopleUpdates) {
      await db.quarterPeople.update(update.quarterPersonId, { subteamId: update.subteamId });
    }
  }

  function resetRoleForm(roleType: ProjectRoleType = getDefaultProjectRoleType(projectRoles)) {
    setNewRoleType(roleType);
    setNewRolePersonId('');
    setNewRoleCapacity(100);
  }

  function startAddingRole() {
    resetRoleForm();
    setAddingRole(true);
  }

  // ── role CRUD ────────────────────────────────────────────────────────────
  async function addRole() {
    if (!newRolePersonId) return;
    const plan = planAddProjectRole(buildProjectTeamContext(), newRoleType, newRolePersonId, {
      createId: uid,
      nowIso: () => new Date().toISOString(),
    });
    if (typeof plan === 'string') return;
    await db.transaction('rw', [db.projectRoles, db.projects, db.subteams, db.people, db.quarterPeople], async () => {
      await applyProjectTeamMutationPlan(plan);
    });
    // For Engineers, immediately write the chosen capacity allocation
    if (newRoleType === 'Engineer') {
      await saveRoleCapacity(newRolePersonId, newRoleCapacity);
    }
    setAddingRole(false);
    resetRoleForm();
  }

  async function saveRoleType(roleId: string, nextRole: ProjectRoleType) {
    const plan = planProjectRoleTypeChange(buildProjectTeamContext(), roleId, nextRole, {
      createId: uid,
      nowIso: () => new Date().toISOString(),
    });
    if (typeof plan === 'string') return;
    await db.transaction('rw', [db.projectRoles, db.projects, db.subteams, db.people, db.quarterPeople], async () => {
      await applyProjectTeamMutationPlan(plan);
    });
  }

  async function saveRolePerson(roleId: string, personId: string) {
    const plan = planProjectRolePersonChange(buildProjectTeamContext(), roleId, personId, {
      createId: uid,
      nowIso: () => new Date().toISOString(),
    });
    if (typeof plan === 'string') return;
    await db.transaction('rw', [db.projectRoles, db.projects, db.subteams, db.people, db.quarterPeople], async () => {
      await applyProjectTeamMutationPlan(plan);
    });
  }

  async function saveRoleCapacity(personId: string, percentage: number) {
    if (!activeQuarter) return;
    const plan = planQuarterProjectAllocation(
      activeQuarter,
      personId,
      projectId,
      percentage,
      activeProjectRoles,
      activeAllocations,
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

  async function addStakeholder() {
    if (!newStakeholderPersonId) return;
    await db.projectStakeholders.add({
      id: uid(),
      quarterId: activeQuarterId ?? '',
      projectId,
      personId: newStakeholderPersonId,
    });
    setAddingStakeholder(false);
    setNewStakeholderPersonId('');
  }

  // ── link CRUD ────────────────────────────────────────────────────────────
  async function addLink() {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    await db.projectLinks.add({ id: uid(), projectId, label: newLinkLabel.trim(), url: newLinkUrl.trim() });
    setAddingLink(false); setNewLinkLabel(''); setNewLinkUrl('');
  }

  // ── unknown CRUD ─────────────────────────────────────────────────────────
  async function addUnknown() {
    if (!newUnknownTitle.trim()) return;
    await db.unknowns.add({
      id: uid(), projectId, quarterId: activeQuarterId ?? '',
      title: newUnknownTitle.trim(), description: newUnknownDesc.trim(),
      resolved: false, resolvedAt: null, createdAt: new Date().toISOString(),
    });
    setAddingUnknown(false); setNewUnknownTitle(''); setNewUnknownDesc('');
  }

  // ── risk CRUD ────────────────────────────────────────────────────────────
  async function addRisk() {
    if (!newRiskTitle.trim()) return;
    await db.risks.add({
      id: uid(), projectId, quarterId: activeQuarterId ?? '',
      title: newRiskTitle.trim(), likelihood: newRiskLikelihood, impact: newRiskImpact,
      mitigationNote: newRiskNote.trim(), mitigated: false, mitigatedAt: null,
      createdAt: new Date().toISOString(),
    });
    setAddingRisk(false); setNewRiskTitle(''); setNewRiskNote('');
  }

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-50">
                <InlineEditText
                  value={project.name}
                  onSave={(v) => saveProject({ name: v })}
                  className="text-2xl font-bold"
                />
              </h1>
              <InlineEditSelect
                value={project.status}
                options={STATUS_OPTIONS}
                onSave={(v) => saveProject({ status: v })}
              />
            </div>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>{projectSubteam?.name ?? 'No subteam yet'}</span>
            </div>
          </div>
          <div className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            health === 'green'  ? 'bg-emerald-500/20 text-emerald-300' :
            health === 'yellow' ? 'bg-amber-500/20 text-amber-300' :
                                  'bg-rose-500/20 text-rose-300'
          }`}>
            {health === 'green' ? '● On track' : health === 'yellow' ? '● At risk' : '● High risk'}
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Description</p>
          <InlineEditText
            value={project.description}
            onSave={(v) => saveProject({ description: v })}
            multiline
            placeholder="Add a description…"
            className="text-sm text-zinc-300 leading-relaxed w-full"
          />
        </div>
      </div>

      {/* ── Quarter Planning ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Quarter planning</h2>

        {assignedQuarters.length === 0 && (
          <p className="text-sm text-zinc-600 italic">This project hasn't been added to any quarter yet.</p>
        )}

        {assignedQuarters.length > 0 && (
          <div className="space-y-3">
            {quarterCapacitySummaries.map(({ quarter, quarterProject, summary }) => {
              const isActive = quarter.status === 'active';
              const remaining = summary.remainingPersonWeeks;
              const overBudget = remaining !== null && remaining < 0;
              return (
                <div
                  key={quarter.id}
                  className={`rounded-lg border p-4 text-sm ${isActive ? 'border-sky-400/30 bg-sky-400/5' : 'border-white/5 bg-white/[0.02]'}`}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-200">{quarter.name}</span>
                      {isActive && (
                        <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-300">active</span>
                      )}
                      {quarter.status === 'closed' && (
                        <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">closed</span>
                      )}
                      {quarter.status === 'draft' && (
                        <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">draft</span>
                      )}
                    </div>

                    <div className="flex items-center gap-6 text-xs text-zinc-400">
                      {/* Estimated */}
                      <div className="flex items-center gap-1">
                        <span className="text-zinc-500">Estimated</span>
                        {isActive && quarterProject ? (
                          <InlineEditNumber
                            value={summary.estimatedPersonWeeks ?? 0}
                            onSave={(v) => db.quarterProjects.update(quarterProject.id, { estimatedPersonWeeks: v > 0 ? v : null })}
                            min={0}
                            suffix=" pw"
                            className="text-zinc-200"
                          />
                        ) : (
                          <span className="text-zinc-300">
                            {summary.estimatedPersonWeeks !== null ? `${summary.estimatedPersonWeeks} pw` : '—'}
                          </span>
                        )}
                      </div>

                      {/* Reserved */}
                      <div className="flex items-center gap-1">
                        <span className="text-zinc-500">Reserved</span>
                        <span className="text-zinc-300">{summary.reservedPersonWeeks} pw</span>
                        <span className="text-zinc-600">({summary.reservedWeeklyPeople} ppl/wk)</span>
                      </div>

                      {/* Remaining */}
                      {summary.estimatedPersonWeeks !== null && (
                        <div className="flex items-center gap-1">
                          <span className="text-zinc-500">Remaining</span>
                          <span className={overBudget ? 'text-rose-400 font-medium' : 'text-emerald-400'}>
                            {overBudget ? '' : '+'}{remaining} pw
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar — only when estimate is set */}
                  {summary.estimatedPersonWeeks !== null && summary.estimatedPersonWeeks > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${overBudget ? 'bg-rose-500' : 'bg-sky-500'}`}
                          style={{ width: `${Math.min(100, (summary.reservedPersonWeeks / summary.estimatedPersonWeeks) * 100).toFixed(1)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Delivery Team ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Delivery team</h2>
          <button
            onClick={startAddingRole}
            className="text-xs text-sky-400 hover:text-sky-200"
          >+ Add role</button>
        </div>

        {sortedRoles.length === 0 && !addingRole && (
          <p className="text-sm text-zinc-600 italic">No roles assigned yet.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {sortedRoles.map((role) => {
            const person = people.find((candidate) => candidate.id === role.personId);
            const showsCapacity = person ? personNeedsProjectCapacity(person.role) : false;
            const capacityShare = person
              ? getPersonProjectCapacityShare(person, projectId, activeProjectRoles, activeAllocations)
              : { projectId, percentage: 0, isEvenSplit: true };
            return (
              <div key={role.id} className="group relative text-sm rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <p className="mb-1 text-xs text-zinc-500">
                  <InlineEditSelect
                    value={role.role as ProjectRoleType}
                    options={ROLE_OPTIONS.filter((option) => getEditableProjectRoleOptions(projectRoles, role.role).includes(option.value))}
                    onSave={(v) => saveRoleType(role.id, v)}
                  />
                </p>
                <InlineEditSelect
                  value={role.personId}
                  options={getAssignablePeopleForProjectRole(people, projectRoles, role.role, role.personId)
                    .map((p) => ({ value: p.id, label: p.name }))}
                  onSave={(v) => saveRolePerson(role.id, v)}
                  className="font-medium text-zinc-200"
                />
                {showsCapacity && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-zinc-500">
                    <span>Capacity</span>
                    <InlineEditNumber
                      value={capacityShare.percentage}
                      onSave={(value) => saveRoleCapacity(role.personId, value)}
                      min={0}
                      max={100}
                      suffix="%"
                      className={capacityShare.isEvenSplit ? 'text-zinc-400' : 'text-zinc-200'}
                    />
                    {capacityShare.isEvenSplit && <span className="italic text-zinc-600">(equal)</span>}
                  </div>
                )}
                <button
                  onClick={() => db.projectRoles.delete(role.id)}
                  className="absolute top-2 right-2 hidden group-hover:block text-zinc-600 hover:text-rose-400 text-xs"
                  title="Remove role"
                >✕</button>
              </div>
            );
          })}
        </div>

        {addingRole && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={newRoleType}
              onChange={(e) => {
                const roleType = e.target.value as ProjectRoleType;
                setNewRoleType(roleType);
                setNewRolePersonId('');
                setNewRoleCapacity(100);
              }}
              className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
            >
              {addRoleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={newRolePersonId}
              onChange={(e) => {
                const personId = e.target.value;
                setNewRolePersonId(personId);
                if (newRoleType === 'Engineer' && personId) {
                  setNewRoleCapacity(getRemainingCapacity(personId));
                }
              }}
              className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
            >
              <option value="">Select person…</option>
              {addablePeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {newRoleType === 'Engineer' && newRolePersonId && (
              <div className="flex items-center gap-1 text-sm text-zinc-400">
                <span>Capacity</span>
                <input
                  type="number"
                  value={newRoleCapacity}
                  onChange={(e) => setNewRoleCapacity(Math.max(0, Math.min(100, Number(e.target.value))))}
                  min={0}
                  max={100}
                  className="w-16 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
                />
                <span>%</span>
              </div>
            )}
            <button onClick={addRole} className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500">Add</button>
            <button onClick={() => { setAddingRole(false); resetRoleForm(); }} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
            {newRoleType === 'DRI' && currentDri && (
              <p className="text-xs text-amber-300">This project already has a DRI.</p>
            )}
          </div>
        )}
      </section>

      {/* ── Stakeholders ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Stakeholders</h2>
          <button
            onClick={() => setAddingStakeholder(true)}
            className="text-xs text-sky-400 hover:text-sky-200"
          >+ Add stakeholder</button>
        </div>

        {projectStakeholders.length === 0 && !addingStakeholder && (
          <p className="text-sm text-zinc-600 italic">No stakeholders added yet.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {projectStakeholders.map((stakeholder) => (
            <div key={stakeholder.id} className="group relative text-sm rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <p className="mb-1 text-xs text-zinc-500">Stakeholder</p>
              <InlineEditSelect
                value={stakeholder.personId}
                options={people.map((person) => ({ value: person.id, label: person.name }))}
                onSave={(value) => db.projectStakeholders.update(stakeholder.id, { personId: value })}
                className="font-medium text-zinc-200"
              />
              <button
                onClick={() => db.projectStakeholders.delete(stakeholder.id)}
                className="absolute top-2 right-2 hidden group-hover:block text-zinc-600 hover:text-rose-400 text-xs"
                title="Remove stakeholder"
              >✕</button>
            </div>
          ))}
        </div>

        {addingStakeholder && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={newStakeholderPersonId}
              onChange={(e) => setNewStakeholderPersonId(e.target.value)}
              className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
            >
              <option value="">Select stakeholder…</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <button onClick={addStakeholder} className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500">Add</button>
            <button onClick={() => setAddingStakeholder(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
        )}
      </section>

      {/* ── Links ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Links</h2>
          <button onClick={() => setAddingLink(true)} className="text-xs text-sky-400 hover:text-sky-200">+ Add link</button>
        </div>

        {projectLinks.length === 0 && !addingLink && (
          <p className="text-sm text-zinc-600 italic">No links yet.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {projectLinks.map((link) => (
            <div key={link.id} className="group flex items-center gap-1 rounded-lg border border-sky-400/20 bg-sky-400/10 px-2 py-1">
              <a href={link.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-sky-200 hover:underline">
                <InlineEditText
                  value={link.label}
                  onSave={(v) => db.projectLinks.update(link.id, { label: v })}
                  className="text-xs text-sky-200"
                />
              </a>
              <button
                onClick={() => db.projectLinks.delete(link.id)}
                className="hidden group-hover:block text-zinc-500 hover:text-rose-400 text-xs ml-1"
              >✕</button>
            </div>
          ))}
        </div>

        {addingLink && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              placeholder="Label"
              value={newLinkLabel}
              onChange={(e) => setNewLinkLabel(e.target.value)}
              className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 w-32"
            />
            <input
              placeholder="https://…"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 w-56"
            />
            <button onClick={addLink} className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500">Add</button>
            <button onClick={() => setAddingLink(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
        )}
      </section>

      {/* ── Unknowns ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            Unknowns <span className="font-normal text-zinc-500">({openUnknowns} open)</span>
          </h2>
          <button onClick={() => setAddingUnknown(true)} className="text-xs text-sky-400 hover:text-sky-200">+ Add</button>
        </div>

        {unknowns.length === 0 && !addingUnknown && (
          <p className="text-sm text-zinc-600 italic">No unknowns logged.</p>
        )}

        <div className="space-y-2">
          {unknowns.map((u) => (
            <div key={u.id} className={`group relative p-3 rounded-lg border text-sm ${
              u.resolved ? 'border-white/10 bg-white/[0.03] text-zinc-500' : 'border-amber-400/20 bg-amber-400/10 text-amber-100'
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    <InlineEditText value={u.title} onSave={(v) => db.unknowns.update(u.id, { title: v })} />
                  </p>
                  <p className="text-xs mt-0.5 opacity-80">
                    <InlineEditText
                      value={u.description}
                      onSave={(v) => db.unknowns.update(u.id, { description: v })}
                      multiline
                      placeholder="Add description…"
                    />
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => db.unknowns.update(u.id, {
                      resolved: !u.resolved,
                      resolvedAt: !u.resolved ? new Date().toISOString() : null,
                    })}
                    className="text-xs text-zinc-400 hover:text-zinc-100"
                  >{u.resolved ? 'Reopen' : 'Resolve'}</button>
                  <button
                    onClick={() => db.unknowns.delete(u.id)}
                    className="hidden group-hover:block text-zinc-500 hover:text-rose-400 text-xs"
                  >✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {addingUnknown && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <input
              placeholder="Title"
              value={newUnknownTitle}
              onChange={(e) => setNewUnknownTitle(e.target.value)}
              className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
            />
            <textarea
              placeholder="Description (optional)"
              value={newUnknownDesc}
              onChange={(e) => setNewUnknownDesc(e.target.value)}
              rows={2}
              className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
            />
            <div className="flex gap-2">
              <button onClick={addUnknown} className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500">Add</button>
              <button onClick={() => setAddingUnknown(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* ── Risks ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            Risks <span className="font-normal text-zinc-500">({openRisks} open)</span>
          </h2>
          <button onClick={() => setAddingRisk(true)} className="text-xs text-sky-400 hover:text-sky-200">+ Add</button>
        </div>

        {risks.length === 0 && !addingRisk && (
          <p className="text-sm text-zinc-600 italic">No risks logged.</p>
        )}

        <div className="space-y-2">
          {risks.map((r) => (
            <div key={r.id} className={`group relative p-3 rounded-lg border text-sm ${
              r.mitigated ? 'border-white/10 bg-white/[0.03] text-zinc-500' : 'border-rose-400/20 bg-rose-400/10 text-rose-100'
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-medium">
                    <InlineEditText value={r.title} onSave={(v) => db.risks.update(r.id, { title: v })} />
                  </p>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span>Likelihood:&nbsp;
                      <InlineEditSelect value={r.likelihood} options={LIKELIHOOD_OPTIONS} onSave={(v) => db.risks.update(r.id, { likelihood: v })} />
                    </span>
                    <span>Impact:&nbsp;
                      <InlineEditSelect value={r.impact} options={IMPACT_OPTIONS} onSave={(v) => db.risks.update(r.id, { impact: v })} />
                    </span>
                  </div>
                  <p className="text-xs opacity-80">
                    <InlineEditText
                      value={r.mitigationNote}
                      onSave={(v) => db.risks.update(r.id, { mitigationNote: v })}
                      multiline
                      placeholder="Mitigation note…"
                    />
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => db.risks.update(r.id, {
                      mitigated: !r.mitigated,
                      mitigatedAt: !r.mitigated ? new Date().toISOString() : null,
                    })}
                    className="text-xs text-zinc-400 hover:text-zinc-100"
                  >{r.mitigated ? 'Reopen' : 'Mitigate'}</button>
                  <button
                    onClick={() => db.risks.delete(r.id)}
                    className="hidden group-hover:block text-zinc-500 hover:text-rose-400 text-xs"
                  >✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {addingRisk && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <input
              placeholder="Title"
              value={newRiskTitle}
              onChange={(e) => setNewRiskTitle(e.target.value)}
              className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
            />
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1 text-zinc-400">
                Likelihood
                <select value={newRiskLikelihood} onChange={(e) => setNewRiskLikelihood(e.target.value as RiskLikelihood)}
                  className="rounded border border-white/10 bg-zinc-900 px-2 py-0.5 text-zinc-200">
                  {LIKELIHOOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                Impact
                <select value={newRiskImpact} onChange={(e) => setNewRiskImpact(e.target.value as RiskImpact)}
                  className="rounded border border-white/10 bg-zinc-900 px-2 py-0.5 text-zinc-200">
                  {IMPACT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <textarea
              placeholder="Mitigation note (optional)"
              value={newRiskNote}
              onChange={(e) => setNewRiskNote(e.target.value)}
              rows={2}
              className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
            />
            <div className="flex gap-2">
              <button onClick={addRisk} className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500">Add</button>
              <button onClick={() => setAddingRisk(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
