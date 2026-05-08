'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { computeProjectHealth } from '@/lib/project-health';
import type { ProjectStatus } from '@/lib/types';

function uid() { return crypto.randomUUID(); }

const ACTIVE_STATUSES = new Set<ProjectStatus>(['Proposed', 'Active', 'On Hold']);
const ARCHIVED_STATUSES = new Set<ProjectStatus>(['Complete', 'Cancelled']);

export default function ProjectsPage() {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Proposed');
  const [showArchived, setShowArchived] = useState(false);

  const data = useLiveQuery(async () => {
    const [projects, people, projectRoles, quarters, unknowns, risks] = await Promise.all([
      db.projects.orderBy('name').toArray(),
      db.people.toArray(),
      db.projectRoles.toArray(),
      db.quarters.where('status').equals('active').toArray(),
      db.unknowns.toArray(),
      db.risks.toArray(),
    ]);
    return { projects, people, projectRoles, quarters, unknowns, risks };
  });

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;

  const { projects, people, projectRoles, quarters, unknowns, risks } = data;
  const personById = new Map(people.map((p) => [p.id, p]));
  const activeQuarterId = quarters[0]?.id;

  const driByProject = new Map<string, string>();
  const emByProject = new Map<string, string>();
  const pmByProject = new Map<string, string>();
  for (const role of projectRoles) {
    if (activeQuarterId && role.quarterId !== activeQuarterId) continue;
    if (role.role === 'DRI' && !driByProject.has(role.projectId)) {
      driByProject.set(role.projectId, role.personId);
    }
    if (role.role === 'EM' && !emByProject.has(role.projectId)) {
      emByProject.set(role.projectId, role.personId);
    }
    if (role.role === 'PM' && !pmByProject.has(role.projectId)) {
      pmByProject.set(role.projectId, role.personId);
    }
  }

  const activeProjects = projects.filter((p) => ACTIVE_STATUSES.has(p.status));
  const archivedProjects = projects.filter((p) => ARCHIVED_STATUSES.has(p.status));

  async function createProject() {
    if (!name.trim()) return;
    const id = uid();
    await db.projects.add({
      id, name: name.trim(), description: '', status,
      owningSubteamId: null, createdAt: new Date().toISOString(), archivedAt: null,
    });
    setName(''); setAdding(false);
  }

  function renderProjectGrid(list: typeof projects) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((project) => {
          const driId = driByProject.get(project.id);
          const emId = emByProject.get(project.id);
          const pmId = pmByProject.get(project.id);
          return (
            <div key={project.id} className="group relative">
              <Link href={`/projects/${project.id}`}>
                <ProjectCard
                  project={project}
                  dri={driId ? personById.get(driId) : null}
                  em={emId ? personById.get(emId) : null}
                  pm={pmId ? personById.get(pmId) : null}
                  health={computeProjectHealth(
                    unknowns.filter((u) => u.projectId === project.id),
                    risks.filter((r) => r.projectId === project.id),
                  )}
                />
              </Link>
              <button
                onClick={() => db.projects.delete(project.id)}
                className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-zinc-500 hover:bg-rose-900/60 hover:text-rose-400 text-xs"
                title="Delete project"
              >✕</button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-50">Projects</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8"
        >+ New project</button>
      </div>

      {adding && (
        <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') setAdding(false); }}
            className="rounded border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 w-64 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
          >
            {(['Proposed','Active','On Hold','Complete','Cancelled'] as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button onClick={createProject} className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">Create</button>
          <button onClick={() => setAdding(false)} className="text-sm text-zinc-500 hover:text-zinc-300">Cancel</button>
        </div>
      )}

      {activeProjects.length === 0 && !adding ? (
        <EmptyState title="No projects yet" description="Create a project to start planning." />
      ) : (
        renderProjectGrid(activeProjects)
      )}

      {archivedProjects.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <span className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}>▶</span>
            <span>Archived ({archivedProjects.length})</span>
          </button>
          {showArchived && renderProjectGrid(archivedProjects)}
        </div>
      )}
    </div>
  );
}
