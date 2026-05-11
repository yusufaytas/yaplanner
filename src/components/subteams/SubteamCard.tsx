import type { Subteam, Person } from '@/lib/types';

interface SubteamCardProps {
  subteam: Subteam;
  dri?: Person | null;
  memberCount?: number;
  bufferPct?: number; // current quarter buffer %
}

export function SubteamCard({ subteam, dri, memberCount, bufferPct }: SubteamCardProps) {
  const bufferColor =
    bufferPct === undefined
      ? 'text-zinc-500'
      : bufferPct < 0
        ? 'text-rose-400 font-semibold'
        : bufferPct < 20
          ? 'text-amber-300'
          : 'text-emerald-300';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-sky-400/30 hover:bg-white/[0.07]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">{subteam.name}</h3>
        {memberCount !== undefined && (
          <span className="shrink-0 text-xs text-zinc-500">{memberCount} people</span>
        )}
      </div>
      {subteam.purpose ? (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400 border-t border-white/5 pt-2">{subteam.purpose}</p>
      ) : (
        <p className="mt-2 text-xs italic text-zinc-600 border-t border-white/5 pt-2">No purpose set</p>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
        {dri && (
          <span className="flex items-center gap-1">
            <span className="text-zinc-600">DRI</span>
            <span className="font-medium text-zinc-200">{dri.name}</span>
          </span>
        )}
        {bufferPct !== undefined && (
          <span className={`ml-auto tabular-nums ${bufferColor}`}>
            {bufferPct > 0 ? '+' : ''}{bufferPct}% buffer
          </span>
        )}
      </div>
    </div>
  );
}
