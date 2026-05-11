'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { QuarterStatus } from '@/lib/types';
import { createQuarter as createQuarterRecord, getQuartersPageData, suggestNextQuarter, updateQuarterDraftEndDate, updateQuarterDraftStartDate } from '@/lib/quarters';

const statusVariant: Record<QuarterStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'success',
  draft: 'info',
  closed: 'warning',
  archived: 'neutral',
};

function uid() { return crypto.randomUUID(); }

export default function QuartersPage() {
  const quarters = useLiveQuery(() => getQuartersPageData());

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endDateManuallyEdited, setEndDateManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  async function createQuarterHandler() {
    if (!name.trim() || !startDate || !endDate) return;
    setSaving(true);
    try {
      await createQuarterRecord({ id: uid(), name, startDate, endDate });
      setAdding(false);
      setName('');
      setStartDate('');
      setEndDate('');
      setEndDateManuallyEdited(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setAdding(false);
    setName('');
    setStartDate('');
    setEndDate('');
    setEndDateManuallyEdited(false);
  }

  if (!quarters) return <div className="text-sm text-zinc-500">Loading…</div>;

  const inputCls = 'rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-50">Quarters</h1>
        {!adding && (
          <button
            onClick={() => {
              if (quarters.length > 0) {
                const suggestion = suggestNextQuarter(quarters[0]);
                setName(suggestion.name);
                setStartDate(suggestion.startDate);
                setEndDate(suggestion.endDate);
                setEndDateManuallyEdited(false);
              }
              setAdding(true);
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-sky-400/30 hover:bg-white/8"
          >
            + New quarter
          </button>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input
            autoFocus
            placeholder="Name — e.g. 2026-Q4"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createQuarterHandler(); if (e.key === 'Escape') cancel(); }}
            className={`${inputCls} w-36`}
          />
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-zinc-500">Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const nextDraft = updateQuarterDraftStartDate(
                  { startDate, endDate, endDateManuallyEdited },
                  e.target.value,
                );
                setStartDate(nextDraft.startDate);
                setEndDate(nextDraft.endDate);
                setEndDateManuallyEdited(nextDraft.endDateManuallyEdited);
              }}
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-zinc-500">End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                const nextDraft = updateQuarterDraftEndDate(
                  { startDate, endDate, endDateManuallyEdited },
                  e.target.value,
                );
                setStartDate(nextDraft.startDate);
                setEndDate(nextDraft.endDate);
                setEndDateManuallyEdited(nextDraft.endDateManuallyEdited);
              }}
              className={inputCls}
            />
          </div>
          <button
            onClick={createQuarterHandler}
            disabled={!name.trim() || !startDate || !endDate || saving}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
          <button onClick={cancel} className="text-sm text-zinc-500 hover:text-zinc-300">Cancel</button>
        </div>
      )}

      {quarters.length === 0 && !adding ? (
        <EmptyState title="No quarters yet" description="Create a quarter to start planning." />
      ) : (
        <div className="space-y-2">
          {quarters.map((q) => (
            <Link
              key={q.id}
              href={`/quarters/${q.id}`}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 hover:border-sky-400/30 hover:bg-white/[0.07]"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-100">{q.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {q.startDate} → {q.endDate}
                </p>
              </div>
              <Badge variant={statusVariant[q.status]}>{q.status}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
