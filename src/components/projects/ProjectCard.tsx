import type { Project, Person } from '@/lib/types';
import { type ProjectHealth, projectHealthMeta } from '@/lib/project-health';
import { getProjectCardPersonName } from '@/lib/people-directory';
import { getProjectTags } from '@/lib/project-tags';

interface ProjectCardProps {
  project: Project;
  dri?: Person | null;
  em?: Person | null;
  pm?: Person | null;
  health?: ProjectHealth;
}

export function ProjectCard({ project, dri, em, pm, health }: ProjectCardProps) {
  const healthMeta = health ? projectHealthMeta[health] : null;
  const tags = getProjectTags(project).slice(0, 3);
  const visiblePeople = [dri, em, pm];

  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-sky-400/30 hover:bg-white/[0.07]">
      {/* RAG dot — top-right corner */}
      {healthMeta && (
        <span
          title={healthMeta.label}
          className={`absolute top-3 right-3 h-2.5 w-2.5 rounded-full ${healthMeta.dotBg} ${healthMeta.dotShadow} shadow-[0_0_6px_1px]`}
        />
      )}

      <div className={`mb-2 ${healthMeta ? 'pr-5' : ''}`}>
        <h3 className="text-sm font-semibold leading-snug text-zinc-100">{project.name}</h3>
      </div>

      {project.description && (
        <p className="mb-3 line-clamp-2 text-xs text-zinc-400">{project.description}</p>
      )}

      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-zinc-400">
        {dri && (
          <span className="flex items-center gap-1">
            <span className="text-zinc-500">DRI</span>
            <span className="font-medium text-zinc-200">{getProjectCardPersonName(dri, visiblePeople)}</span>
          </span>
        )}
        {em && (
          <span className="flex items-center gap-1">
            <span className="text-zinc-500">EM</span>
            <span className="font-medium text-zinc-200">{getProjectCardPersonName(em, visiblePeople)}</span>
          </span>
        )}
        {pm && (
          <span className="flex items-center gap-1">
            <span className="text-zinc-500">PM</span>
            <span className="font-medium text-zinc-200">{getProjectCardPersonName(pm, visiblePeople)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
