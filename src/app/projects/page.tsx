'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { buildProjectLeadershipMaps, splitProjectsByStatus } from '@/lib/project-directory';
import { buildProjectHealthMap, getOverAllocatedProjectIds } from '@/lib/project-health';
import { filterProjectsByTags, filterTagOptions, listProjectTags, normalizeProjectTag } from '@/lib/project-tags';
import { createProject as createProjectRecord, deleteProjectCascade, getProjectsPageData } from '@/lib/projects';
import { getActiveCycle } from '@/lib/cycles';
import type { ProjectStatus } from '@/lib/types';

function uid() { return crypto.randomUUID(); }

const COLLAPSED_TAG_LIMIT = 12;

export default function ProjectsPage() {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Proposed');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const deferredTagQuery = useDeferredValue(tagQuery);
  const [showAllTags, setShowAllTags] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const data = useLiveQuery(() => getProjectsPageData());

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;

  const { projects, people, allocations, quarters, cyclePeople } = data;
  const personById = new Map(people.map((p) => [p.id, p]));
  const activeCycle = getActiveCycle(quarters);
  const activeCycleId = activeCycle?.id;
  const overAllocatedProjectIds = activeCycle
    ? getOverAllocatedProjectIds({ quarter: activeCycle, people, cyclePeople, allocations })
    : undefined;
  const { driByProject, emByProject, pmByProject } = buildProjectLeadershipMaps(projects, allocations, activeCycleId ?? null);
  const healthByProject = buildProjectHealthMap(projects, undefined, undefined, overAllocatedProjectIds);
  const { activeProjects, archivedProjects } = splitProjectsByStatus(projects);
  const allTags = listProjectTags(projects);
  const visibleTags = filterTagOptions(allTags, deferredTagQuery);
  const displayedTags = showAllTags || deferredTagQuery
    ? visibleTags
    : visibleTags.slice(0, COLLAPSED_TAG_LIMIT);
  const filteredActiveProjects = filterProjectsByTags(activeProjects, selectedTags);
  const filteredArchivedProjects = filterProjectsByTags(archivedProjects, selectedTags);

  async function createProjectHandler() {
    if (!name.trim()) return;
    const id = uid();
    await createProjectRecord({ id, name, status });
    setName(''); setAdding(false);
  }

  function toggleTag(tag: string) {
    const normalizedTag = normalizeProjectTag(tag);
    setSelectedTags((current) =>
      current.includes(normalizedTag)
        ? current.filter((entry) => entry !== normalizedTag)
        : [...current, normalizedTag],
    );
  }

  function renderProjectGrid(list: typeof projects, showStatus = false) {
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
                  health={healthByProject.get(project.id)}
                  showStatus={showStatus}
                />
              </Link>
              <button
                onClick={() => deleteProjectCascade(project.id, project.subteamId)}
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding(true)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8"
          >+ New project</button>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Tags</span>
              {selectedTags.length > 0 && (
                <span className="text-xs text-zinc-500">{selectedTags.length} selected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={tagQuery}
                onChange={(e) => {
                  setTagQuery(e.target.value);
                  if (e.target.value) setShowAllTags(true);
                }}
                placeholder="Search tags…"
                className="w-40 rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none"
              />
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-sm text-zinc-500 hover:text-zinc-300"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
            {displayedTags.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-sky-400/40 bg-sky-400/15 text-sky-200'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
            {displayedTags.length === 0 && (
              <p className="text-sm text-zinc-500">No tags match that search.</p>
            )}
          </div>
          {!deferredTagQuery && visibleTags.length > COLLAPSED_TAG_LIMIT && (
            <button
              onClick={() => setShowAllTags((current) => !current)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              {showAllTags ? 'Show fewer tags' : `Show all ${visibleTags.length} tags`}
            </button>
          )}
        </div>
      )}

      {adding && (
        <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createProjectHandler(); if (e.key === 'Escape') setAdding(false); }}
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
          <button onClick={createProjectHandler} className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">Create</button>
          <button onClick={() => setAdding(false)} className="text-sm text-zinc-500 hover:text-zinc-300">Cancel</button>
        </div>
      )}

      {filteredActiveProjects.length === 0 && !adding ? (
        <EmptyState
          title={selectedTags.length > 0 ? 'No projects for these tags' : 'No projects yet'}
          description={selectedTags.length > 0
            ? `No active or proposed projects match ${selectedTags.map((tag) => `#${tag}`).join(', ')}.`
            : 'Create a project to start planning.'}
        />
      ) : (
        renderProjectGrid(filteredActiveProjects)
      )}

      {filteredArchivedProjects.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <span className={`transition-transform inline-block ${showArchived ? 'rotate-90' : ''}`}>▶</span>
            <span>Past Projects ({filteredArchivedProjects.length})</span>
          </button>
          {showArchived && renderProjectGrid(filteredArchivedProjects, true)}
        </div>
      )}
    </div>
  );
}
