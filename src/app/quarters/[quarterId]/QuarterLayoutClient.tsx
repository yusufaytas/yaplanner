'use client';

import { useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/Badge';
import type { QuarterStatus } from '@/lib/types';
import {
  getQuarterEditStatus,
  getStoredQuarterStatusForEditStatus,
  listResolvedQuarters,
  updateQuarterDraftEndDate,
  updateQuarterDraftStartDate,
  type QuarterEditStatus,
} from '@/lib/quarters';

const statusVariant: Record<QuarterStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'success',
  draft: 'info',
  closed: 'warning',
  archived: 'neutral',
};

export default function QuarterLayoutClient({ children }: { children: React.ReactNode }) {
  const { quarterId } = useParams<{ quarterId: string }>();
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [endDateManuallyEdited, setEndDateManuallyEdited] = useState(false);
  const [draftStatus, setDraftStatus] = useState<QuarterEditStatus>('auto');
  const [saving, setSaving] = useState(false);
  const data = useLiveQuery(
    async () => {
      const [rawQuarter, resolvedQuarters] = await Promise.all([
        db.quarters.get(quarterId),
        listResolvedQuarters(),
      ]);
      return {
        rawQuarter,
        quarter: resolvedQuarters.find((entry) => entry.id === quarterId) ?? null,
      };
    },
    [quarterId],
  );

  const quarter = data?.quarter ?? null;
  const rawQuarter = data?.rawQuarter ?? null;

  const navLinks = [
    { href: `/quarters/${quarterId}`, label: 'Portfolio', exact: true },
    { href: `/quarters/${quarterId}/capacity-planning`, label: 'Capacity Planning', exact: false },
    { href: `/quarters/${quarterId}/people`, label: 'People', exact: false },
  ];

  function startEditing() {
    if (!rawQuarter) return;
    setDraftName(rawQuarter.name);
    setDraftStartDate(rawQuarter.startDate);
    setDraftEndDate(rawQuarter.endDate);
    setEndDateManuallyEdited(false);
    setDraftStatus(getQuarterEditStatus(rawQuarter.status));
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEndDateManuallyEdited(false);
  }

  async function saveQuarter() {
    if (!rawQuarter || !draftName.trim() || !draftStartDate || !draftEndDate) return;
    setSaving(true);
    try {
      await db.quarters.update(rawQuarter.id, {
        name: draftName.trim(),
        startDate: draftStartDate,
        endDate: draftEndDate,
        status: getStoredQuarterStatusForEditStatus(draftStatus),
      });
      setEditing(false);
      setEndDateManuallyEdited(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Quarter header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/quarters" className="text-sm text-zinc-500 hover:text-zinc-200">
            ← Quarters
          </Link>
          {quarter && (
            <>
              <span className="text-zinc-700">/</span>
              <span className="text-sm font-semibold text-zinc-100">{quarter.name}</span>
              <Badge variant={statusVariant[quarter.status]}>{quarter.status}</Badge>
            </>
          )}
        </div>
        {quarter && rawQuarter && !editing && (
          <button
            onClick={startEditing}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8"
          >
            Edit quarter
          </button>
        )}
      </div>

      {quarter && rawQuarter && editing && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40">
              <label className="mb-1 block text-xs text-zinc-500">Name</label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Start</label>
              <input
                type="date"
                value={draftStartDate}
                onChange={(e) => {
                  const nextDraft = updateQuarterDraftStartDate(
                    {
                      startDate: draftStartDate,
                      endDate: draftEndDate,
                      endDateManuallyEdited,
                    },
                    e.target.value,
                  );
                  setDraftStartDate(nextDraft.startDate);
                  setDraftEndDate(nextDraft.endDate);
                  setEndDateManuallyEdited(nextDraft.endDateManuallyEdited);
                }}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">End</label>
              <input
                type="date"
                value={draftEndDate}
                onChange={(e) => {
                  const nextDraft = updateQuarterDraftEndDate(
                    {
                      startDate: draftStartDate,
                      endDate: draftEndDate,
                      endDateManuallyEdited,
                    },
                    e.target.value,
                  );
                  setDraftStartDate(nextDraft.startDate);
                  setDraftEndDate(nextDraft.endDate);
                  setEndDateManuallyEdited(nextDraft.endDateManuallyEdited);
                }}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:border-sky-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Status</label>
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as QuarterEditStatus)}
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:border-sky-500/50 focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={saveQuarter}
                disabled={!draftName.trim() || !draftStartDate || !draftEndDate || saving}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEditing}
                className="text-sm text-zinc-500 hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Nav */}
      <nav className="flex gap-1 border-b border-white/10 pb-0">
        {navLinks.map((link) => {
          const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-2 text-sm rounded-t transition-colors ${
                isActive
                  ? 'text-zinc-100 border-b-2 border-sky-400 -mb-px'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
