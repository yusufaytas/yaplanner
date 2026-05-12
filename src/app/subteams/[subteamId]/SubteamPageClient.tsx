'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import Link from 'next/link';
import { PersonCard } from '@/components/people/PersonCard';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { InlineEditText } from '@/components/ui/InlineEdit';
import { buildProjectLeadershipMaps } from '@/lib/project-directory';
import { buildProjectHealthMap, getOverAllocatedProjectIds } from '@/lib/project-health';
import { getSubteamActiveAllocations, getSubteamPageData, getSubteamPeople, getSubteamProjectCollections, updateSubteam } from '@/lib/subteams';
import { getActiveCycle } from '@/lib/cycles';
import { updateProjectSubteam } from '@/lib/projects';

export default function SubteamPageClient() {
  const { subteamId } = useParams<{ subteamId: string }>();
  const [addingProject, setAddingProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const data = useLiveQuery(() => getSubteamPageData(subteamId), [subteamId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!data.subteam) return <div className="text-sm text-zinc-400">Subteam not found.</div>;

  const { subteam, people, quarters, projects, allocations, cyclePeople } = data;
  const activeCycle = getActiveCycle(quarters);
  const activeAllocations = allocations.filter(
    (allocation) => allocation.endDate === null && (activeCycle ? allocation.cycleId === activeCycle.id : true),
  );
  const memberAllocations = getSubteamActiveAllocations(projects, activeAllocations, subteamId);
  const members = getSubteamPeople(people, memberAllocations);
  const { ownedProjects, contributingProjects } = getSubteamProjectCollections(projects, memberAllocations, subteamId);
  const personById = new Map(people.map((person) => [person.id, person]));
  const { driByProject, emByProject, pmByProject } = buildProjectLeadershipMaps(projects, activeAllocations, activeCycle?.id ?? null);
  const overAllocatedProjectIds = activeCycle
    ? getOverAllocatedProjectIds({ quarter: activeCycle, people, cyclePeople, allocations })
    : undefined;
  const healthByProject = buildProjectHealthMap(projects, undefined, undefined, overAllocatedProjectIds);

  // Projects not yet assigned to any subteam, sorted by name
  const assignableProjects = projects
    .filter((p) => p.subteamId === null && p.status !== 'Complete' && p.status !== 'Cancelled')
    .sort((a, b) => a.name.localeCompare(b.name));

  async function handleAssignProject() {
    if (!selectedProjectId) return;
    await updateProjectSubteam(selectedProjectId, subteamId);
    setSelectedProjectId('');
    setAddingProject(false);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <InlineEditText
          value={subteam.name}
          onSave={(value) => updateSubteam(subteam.id, { name: value })}
          className="text-2xl font-bold text-zinc-50"
        />
        <div className="mt-3 border-t border-white/5 pt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-zinc-600">Purpose</p>
          <InlineEditText
            value={subteam.purpose ?? ''}
            onSave={(value) => updateSubteam(subteam.id, { purpose: value || null })}
            placeholder="Add a purpose…"
            emptyLabel="No purpose set"
            multiline
            className="block w-full text-sm leading-relaxed text-zinc-300"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Current people</h2>
        {members.length === 0 ? (
          <p className="text-sm text-zinc-600 italic">No active project members in this subteam.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {members.map((person) => (
              <Link key={person.id} href={`/people/${person.id}`}>
                <PersonCard person={person} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Owned projects</h2>
          <button
            onClick={() => { setAddingProject((v) => !v); setSelectedProjectId(''); }}
            className="text-xs text-sky-400 hover:text-sky-200 transition-colors"
          >
            {addingProject ? 'Cancel' : '+ Assign project'}
          </button>
        </div>

        {addingProject && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <select
              autoFocus
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="flex-1 rounded border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
            >
              <option value="">Select a project…</option>
              {assignableProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={handleAssignProject}
              disabled={!selectedProjectId}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Assign
            </button>
            {assignableProjects.length === 0 && (
              <span className="text-xs text-zinc-500">No unassigned projects available.</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ownedProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <ProjectCard
                project={project}
                dri={driByProject.get(project.id) ? personById.get(driByProject.get(project.id)!) : null}
                em={emByProject.get(project.id) ? personById.get(emByProject.get(project.id)!) : null}
                pm={pmByProject.get(project.id) ? personById.get(pmByProject.get(project.id)!) : null}
                health={healthByProject.get(project.id)}
              />
            </Link>
          ))}
        </div>
      </div>

      {contributingProjects.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200">Contributing to</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {contributingProjects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <ProjectCard
                  project={project}
                  dri={driByProject.get(project.id) ? personById.get(driByProject.get(project.id)!) : null}
                  em={emByProject.get(project.id) ? personById.get(emByProject.get(project.id)!) : null}
                  pm={pmByProject.get(project.id) ? personById.get(pmByProject.get(project.id)!) : null}
                  health={healthByProject.get(project.id)}
                />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
