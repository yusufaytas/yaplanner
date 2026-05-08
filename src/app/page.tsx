'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db } from '@/lib/db';
import { seedSampleData } from '@/lib/seed';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { PersonCard } from '@/components/people/PersonCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { computeProjectHealth } from '@/lib/project-health';

export default function HomePage() {
  const data = useLiveQuery(async () => {
    const [people, subteams, projects, quarters, projectRoles, unknowns, risks] =
      await Promise.all([
        db.people.toArray(),
        db.subteams.toArray(),
        db.projects.where('status').equals('Active').toArray(),
        db.quarters.where('status').equals('active').toArray(),
        db.projectRoles.toArray(),
        db.unknowns.toArray(),
        db.risks.toArray(),
      ]);
    return { people, subteams, projects, quarters, projectRoles, unknowns, risks };
  });

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-sm text-zinc-500">Loading…</div>
      </div>
    );
  }

  const { people, subteams, projects, quarters, projectRoles, unknowns, risks } = data;
  const activeQuarter = quarters[0] ?? null;

  const personById = new Map(people.map((p) => [p.id, p]));
  const subteamById = new Map(subteams.map((s) => [s.id, s]));

  const driByProject = new Map<string, string>();
  const emByProject  = new Map<string, string>();
  const pmByProject  = new Map<string, string>();
  for (const role of projectRoles) {
    if (activeQuarter && role.quarterId !== activeQuarter.id) continue;
    if (role.role === 'DRI' && !driByProject.has(role.projectId)) driByProject.set(role.projectId, role.personId);
    if (role.role === 'EM'  && !emByProject.has(role.projectId))  emByProject.set(role.projectId, role.personId);
    if (role.role === 'PM'  && !pmByProject.has(role.projectId))  pmByProject.set(role.projectId, role.personId);
  }

  const ems = people.filter((p) => p.role === 'EM');
  const pms = people.filter((p) => p.role === 'PM');
  const isEmpty = people.length === 0 && projects.length === 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Overview</h1>
          {activeQuarter && (
            <p className="mt-0.5 text-sm text-zinc-400">
              Active quarter:{' '}
              <Link
                href={`/quarters/${activeQuarter.id}`}
                className="font-medium text-sky-200 hover:text-sky-100 hover:underline"
              >
                {activeQuarter.name}
              </Link>
            </p>
          )}
        </div>
        {activeQuarter && (
          <Link
            href={`/quarters/${activeQuarter.id}`}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8 hover:text-zinc-50"
          >
            Open quarter plan →
          </Link>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <p className="text-sm text-zinc-500">No data yet.</p>
          <button
            onClick={() => seedSampleData().catch(console.error)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8 hover:text-zinc-50 transition-colors"
          >
            Load sample data
          </button>
        </div>
      ) : (
        <>
          {/* Active Projects */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-zinc-100">
                Active Projects
                <span className="ml-2 text-sm font-normal text-zinc-500">{projects.length}</span>
              </h2>
              <Link href="/projects" className="text-xs text-zinc-400 hover:text-zinc-200 hover:underline">
                All projects →
              </Link>
            </div>
            {projects.length === 0 ? (
              <EmptyState
                title="No active projects"
                description="Create a project and set its status to Active."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.map((project) => {
                  return (
                    <Link key={project.id} href={`/projects/${project.id}`}>
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
                  );
                })}
              </div>
            )}
          </section>

          {/* EMs & PMs */}
          {(ems.length > 0 || pms.length > 0) && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-zinc-100">Leadership</h2>
                <Link href="/people" className="text-xs text-zinc-400 hover:text-zinc-200 hover:underline">
                  All people →
                </Link>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Engineering Managers', items: ems },
                  { label: 'Product Managers', items: pms },
                ].map(({ label, items }) =>
                  items.length === 0 ? null : (
                    <div key={label}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                        {label}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        {items.map((person) => {
                          const subteam = person.subteamId ? subteamById.get(person.subteamId) : null;
                          return (
                            <Link key={person.id} href={`/people/${person.id}`}>
                              <PersonCard person={person} subteamName={subteam?.name} />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
