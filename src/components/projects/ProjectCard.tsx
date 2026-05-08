import type { Project, Person } from '@/lib/types';
import { type ProjectHealth, healthDot } from '@/lib/project-health';

interface ProjectCardProps {
  project: Project;
  dri?: Person | null;
  em?: Person | null;
  pm?: Person | null;
  health?: ProjectHealth;
}

export function ProjectCard({ project, dri, em, pm, health }: ProjectCardProps) {
  const dot = health ? healthDot[health] : null;

  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-sky-400/30 hover:bg-white/[0.07]">
      {/* RAG dot — top-right corner */}
      {dot && (
        <span
          title={dot.title}
          className={`absolute top-3 right-3 h-2.5 w-2.5 rounded-full ${dot.bg} shadow-[0_0_6px_1px] ${
            health === 'green'  ? 'shadow-emerald-400/40' :
            health === 'yellow' ? 'shadow-amber-400/40'   :
            'shadow-rose-500/50'
          }`}
        />
      )}

      <div className={`mb-2 ${dot ? 'pr-5' : ''}`}>
        <h3 className="text-sm font-semibold leading-snug text-zinc-100">{project.name}</h3>
      </div>

      {project.description && (
        <p className="mb-3 line-clamp-2 text-xs text-zinc-400">{project.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-zinc-400">
        {dri && (
          <span className="flex items-center gap-1">
            <span className="text-zinc-500">DRI</span>
            <span className="font-medium text-zinc-200">{dri.name}</span>
          </span>
        )}
        {em && (
          <span className="flex items-center gap-1">
            <span className="text-zinc-500">EM</span>
            <span className="font-medium text-zinc-200">{em.name}</span>
          </span>
        )}
        {pm && (
          <span className="flex items-center gap-1">
            <span className="text-zinc-500">PM</span>
            <span className="font-medium text-zinc-200">{pm.name}</span>
          </span>
        )}
      </div>
    </div>
  );
}
