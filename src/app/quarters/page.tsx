'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useState } from 'react';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { QuarterStatus } from '@/lib/types';
import { DEFAULT_OVERHEAD_ITEMS } from '@/lib/types';

const statusVariant: Record<QuarterStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'success',
  draft: 'info',
  closed: 'warning',
  archived: 'neutral',
};

function uid() { return crypto.randomUUID(); }

/** Given the most recent quarter, suggest name and dates for the next one. */
function suggestNextQuarter(last: { name: string; startDate: string; endDate: string }) {
  // Compute start: day after last quarter's end
  const lastEnd = new Date(last.endDate);
  const nextStart = new Date(lastEnd);
  nextStart.setUTCDate(nextStart.getUTCDate() + 1);

  // Compute end: same duration as last quarter
  const lastStart = new Date(last.startDate);
  const durationMs = lastEnd.getTime() - lastStart.getTime();
  const nextEnd = new Date(nextStart.getTime() + durationMs);

  const toISO = (d: Date) => d.toISOString().slice(0, 10);

  // Suggest name: increment YYYY-QN if it matches, otherwise leave blank
  const match = last.name.match(/^(\d{4})-Q([1-4])$/);
  let nextName = '';
  if (match) {
    const year = parseInt(match[1], 10);
    const q = parseInt(match[2], 10);
    nextName = q === 4 ? `${year + 1}-Q1` : `${year}-Q${q + 1}`;
  }

  return { name: nextName, startDate: toISO(nextStart), endDate: toISO(nextEnd) };
}

export default function QuartersPage() {
  const quarters = useLiveQuery(() =>
    db.quarters.orderBy('startDate').reverse().toArray(),
  );

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function createQuarter() {
    if (!name.trim() || !startDate || !endDate) return;
    setSaving(true);
    try {
      await db.quarters.add({
        id: uid(),
        name: name.trim(),
        startDate,
        endDate,
        status: 'draft',
        createdAt: new Date().toISOString(),
        createdFromQuarterId: null,
        capacityLineAfter: null,
        overhead: { items: DEFAULT_OVERHEAD_ITEMS.map((i) => ({ ...i })) },
      });
      setAdding(false);
      setName('');
      setStartDate('');
      setEndDate('');
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setAdding(false);
    setName('');
    setStartDate('');
    setEndDate('');
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
            onKeyDown={(e) => { if (e.key === 'Enter') createQuarter(); if (e.key === 'Escape') cancel(); }}
            className={`${inputCls} w-36`}
          />
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-zinc-500">Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-zinc-500">End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <button
            onClick={createQuarter}
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
