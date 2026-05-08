import type { Person } from '@/lib/types';

interface PersonCardProps {
  person: Person;
  subteamName?: string;
  allocationPct?: number;
  badge?: string; // optional label shown next to name e.g. "Lead"
}

export function PersonCard({ person, subteamName, allocationPct, badge }: PersonCardProps) {
  const initials = person.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const allocationColor =
    allocationPct === undefined
      ? 'text-zinc-500'
      : allocationPct > 100
        ? 'text-rose-400 font-semibold'
        : allocationPct >= 80
          ? 'text-amber-300'
          : 'text-emerald-300';

  return (
    <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-sky-400/30 hover:bg-white/[0.07]">
      {badge && (
        <span className="absolute top-2 right-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] text-sky-300">
          {badge}
        </span>
      )}
      <div className="h-9 w-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-zinc-300">
        {initials}
      </div>
      <div className={`min-w-0 flex-1 ${badge ? 'pr-14' : ''}`}>
        <p className="truncate text-sm font-medium text-zinc-100">{person.name}</p>
        <p className="truncate text-xs text-zinc-400">
          {person.role}{subteamName ? ` · ${subteamName}` : ''}
        </p>
      </div>
      {allocationPct !== undefined && (
        <span className={`text-sm tabular-nums shrink-0 ${allocationColor}`}>
          {allocationPct}%
        </span>
      )}
    </div>
  );
}
