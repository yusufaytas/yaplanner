'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { PersonCard } from '@/components/people/PersonCard';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { InlineEditText, InlineEditSelect } from '@/components/ui/InlineEdit';
import { computeProjectHealth } from '@/lib/project-health';

export default function SubteamPageClient() {
  const { subteamId } = useParams<{ subteamId: string }>();
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');

  const data = useLiveQuery(async () => {
    const [subteam, members, allPeople, quarters, projects, projectRoles, unknowns, risks] =
      await Promise.all([
        db.subteams.get(subteamId),
        db.people.where('subteamId').equals(subteamId).toArray(),
        db.people.orderBy('name').toArray(),
        db.quarters.where('status').equals('active').toArray(),
        db.projects.toArray(),
        db.projectRoles.toArray(),
        db.unknowns.toArray(),
        db.risks.toArray(),
      ]);
    return { subteam, members, allPeople, quarters, projects, projectRoles, unknowns, risks };
  }, [subteamId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!data.subteam) return <div className="text-sm text-zinc-400">Subteam not found.</div>;

  const { subteam, members, allPeople, quarters, projects, projectRoles, unknowns, risks } = data;
  const engineerMembers = members.filter((person) => person.role === 'Engineer');
  const engineers = allPeople.filter((person) => person.role === 'Engineer');
  const activeQuarter = quarters[0] ?? null;

  const save = (patch: Parameters<typeof db.subteams.update>[1]) =>
    db.subteams.update(subteamId, patch);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const personById = new Map(allPeople.map((p) => [p.id, p]));
  const memberIds = new Set(engineerMembers.map((m) => m.id));

  // People not yet in this subteam
  const nonMembers = engineers.filter((p) => p.subteamId !== subteamId);

  async function addMember() {
    if (!newMemberId) return;
    await db.people.update(newMemberId, { subteamId });
    setNewMemberId('');
    setAddingMember(false);
  }

  async function removeMember(personId: string) {
    if (subteam.driPersonId === personId) return;
    await db.people.update(personId, { subteamId: null });
  }

  // Projects owned by this subteam
  const ownedProjects = projects.filter((p) => p.owningSubteamId === subteamId);

  // Projects where any member has a role in the active quarter (not owned)
  const memberRolesThisQuarter = activeQuarter
    ? projectRoles.filter((r) => r.quarterId === activeQuarter.id && memberIds.has(r.personId))
    : [];
  const ownedIds = new Set(ownedProjects.map((p) => p.id));
  const involvedProjectIds = new Set(memberRolesThisQuarter.map((r) => r.projectId));
  const contributingProjects = [...involvedProjectIds]
    .filter((pid) => !ownedIds.has(pid))
    .map((pid) => projectById.get(pid))
    .filter(Boolean) as typeof projects;

  // DRI, EM, PM per project
  const driByProject = new Map<string, string>();
  const emByProject  = new Map<string, string>();
  const pmByProject  = new Map<string, string>();
  for (const r of projectRoles) {
    if (activeQuarter && r.quarterId !== activeQuarter.id) continue;
    if (r.role === 'DRI' && !driByProject.has(r.projectId)) driByProject.set(r.projectId, r.personId);
    if (r.role === 'EM'  && !emByProject.has(r.projectId))  emByProject.set(r.projectId, r.personId);
    if (r.role === 'PM'  && !pmByProject.has(r.projectId))  pmByProject.set(r.projectId, r.personId);
  }

  // Remove owned project assignment
  async function removeOwnedProject(projectId: string) {
    await db.projects.update(projectId, { owningSubteamId: null });
  }

  // Remove contributing project — delete all roles this quarter for members on that project
  async function removeContributingProject(projectId: string) {
    if (!activeQuarter) return;
    const roleIds = projectRoles
      .filter((r) => r.quarterId === activeQuarter.id && r.projectId === projectId && memberIds.has(r.personId))
      .map((r) => r.id);
    await db.projectRoles.bulkDelete(roleIds);
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">
            <InlineEditText
              value={subteam.name}
              onSave={(v) => save({ name: v })}
              className="text-2xl font-bold"
            />
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            <InlineEditText
              value={subteam.purpose ?? ''}
              onSave={(v) => save({ purpose: v || null })}
              placeholder="Add a purpose…"
              emptyLabel="No purpose set"
              className="text-sm text-zinc-400"
            />
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-zinc-500">DRI</p>
          {/* DRI must be a member */}
          <InlineEditSelect
            value={subteam.driPersonId ?? ''}
            options={[
              ...engineerMembers.map((p) => ({ value: p.id, label: p.name })),
            ]}
            onSave={(v) => save({ driPersonId: v })}
            className="text-sm text-zinc-200"
          />
          {engineerMembers.length === 0 && (
            <p className="mt-1 text-xs text-zinc-600">Add members first to set a DRI.</p>
          )}
          {!subteam.driPersonId && engineerMembers.length > 0 && (
            <p className="mt-1 text-xs text-amber-300">This subteam needs a DRI.</p>
          )}
        </div>
      </div>

      {/* ── Members ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            Members <span className="font-normal text-zinc-500">({engineerMembers.length})</span>
          </h2>
          <button
            onClick={() => setAddingMember(true)}
            className="text-xs text-sky-400 hover:text-sky-200"
          >
            + Add member
          </button>
        </div>

        {addingMember && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              autoFocus
              value={newMemberId}
              onChange={(e) => setNewMemberId(e.target.value)}
              className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
            >
              <option value="">Select person…</option>
              {nonMembers.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.role}</option>
              ))}
            </select>
            <button
              onClick={addMember}
              disabled={!newMemberId}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingMember(false); setNewMemberId(''); }}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        )}

        {engineerMembers.length === 0 && !addingMember ? (
          <p className="text-sm text-zinc-600 italic">No members yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {engineerMembers.map((person) => (
              <div key={person.id} className="group relative">
                <Link href={`/people/${person.id}`}>
                  <PersonCard
                    person={person}
                    badge={subteam.driPersonId === person.id ? 'DRI' : undefined}
                  />
                </Link>
                <button
                  onClick={() => removeMember(person.id)}
                  className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-zinc-500 hover:bg-rose-900/60 hover:text-rose-400 text-xs"
                  title={subteam.driPersonId === person.id ? 'Choose another DRI before removing this member' : 'Remove from subteam'}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Owned projects ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">
          Owned projects <span className="font-normal text-zinc-500">({ownedProjects.length})</span>
        </h2>
        {ownedProjects.length === 0 ? (
          <p className="text-sm text-zinc-600 italic">No projects owned by this subteam.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ownedProjects.map((project) => {
              return (
                <div key={project.id} className="flex flex-col gap-1">
                  <Link href={`/projects/${project.id}`}>
                    <ProjectCard
                      project={project}
                      dri={driByProject.get(project.id) ? personById.get(driByProject.get(project.id)!) : null}
                      em={emByProject.get(project.id)   ? personById.get(emByProject.get(project.id)!)  : null}
                      pm={pmByProject.get(project.id)   ? personById.get(pmByProject.get(project.id)!)  : null}
                      health={computeProjectHealth(
                        unknowns.filter((u) => u.projectId === project.id),
                        risks.filter((r) => r.projectId === project.id),
                      )}
                    />
                  </Link>
                  <button
                    onClick={() => removeOwnedProject(project.id)}
                    className="text-xs text-zinc-600 hover:text-rose-400 text-left px-1"
                  >
                    Remove ownership
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Contributing to ── */}
      {contributingProjects.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200">
            Contributing to
            <span className="ml-1.5 font-normal text-zinc-500">({contributingProjects.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {contributingProjects.map((project) => {
              return (
                <div key={project.id} className="flex flex-col gap-1">
                  <Link href={`/projects/${project.id}`}>
                    <ProjectCard
                      project={project}
                      dri={driByProject.get(project.id) ? personById.get(driByProject.get(project.id)!) : null}
                      em={emByProject.get(project.id)   ? personById.get(emByProject.get(project.id)!)  : null}
                      pm={pmByProject.get(project.id)   ? personById.get(pmByProject.get(project.id)!)  : null}
                      health={computeProjectHealth(
                        unknowns.filter((u) => u.projectId === project.id),
                        risks.filter((r) => r.projectId === project.id),
                      )}
                    />
                  </Link>
                  <button
                    onClick={() => removeContributingProject(project.id)}
                    className="text-xs text-zinc-600 hover:text-rose-400 text-left px-1"
                  >
                    Remove assignment
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
