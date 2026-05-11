'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { PersonCard } from '@/components/people/PersonCard';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { InlineEditText } from '@/components/ui/InlineEdit';
import { buildProjectLeadershipMaps } from '@/lib/project-directory';
import { buildProjectHealthMap, getOverAllocatedProjectIds } from '@/lib/project-health';
import { getSubteamActiveAllocations, getSubteamPageData, getSubteamPeople, getSubteamProjectCollections, updateSubteam } from '@/lib/subteams';
import { getActiveQuarter } from '@/lib/quarters';

export default function SubteamPageClient() {
  const { subteamId } = useParams<{ subteamId: string }>();

  const data = useLiveQuery(() => getSubteamPageData(subteamId), [subteamId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!data.subteam) return <div className="text-sm text-zinc-400">Subteam not found.</div>;

  const { subteam, people, quarters, projects, allocations, quarterPeople } = data;
  const activeQuarter = getActiveQuarter(quarters);
  const activeAllocations = allocations.filter((allocation) => allocation.endDate === null && (activeQuarter ? allocation.quarterId === activeQuarter.id : true));
  const memberAllocations = getSubteamActiveAllocations(projects, activeAllocations, subteamId);
  const members = getSubteamPeople(people, memberAllocations);
  const { ownedProjects, contributingProjects } = getSubteamProjectCollections(projects, memberAllocations, subteamId);
  const personById = new Map(people.map((person) => [person.id, person]));
  const { driByProject, emByProject, pmByProject } = buildProjectLeadershipMaps(projects, activeAllocations, activeQuarter?.id ?? null);
  const overAllocatedProjectIds = activeQuarter
    ? getOverAllocatedProjectIds({ quarter: activeQuarter, people, quarterPeople, allocations })
    : undefined;
  const healthByProject = buildProjectHealthMap(projects, undefined, undefined, overAllocatedProjectIds);

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
        <h2 className="text-sm font-semibold text-zinc-200">Owned projects</h2>
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
