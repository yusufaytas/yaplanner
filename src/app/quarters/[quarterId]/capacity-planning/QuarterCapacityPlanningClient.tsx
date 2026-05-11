'use client';

import { Fragment, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { getQuarterPersonCapacitySummary, personTracksCapacity } from '@/lib/person-capacity';
import { getCapacityPlanningData, updateQuarter, updateQuarterPerson } from '@/lib/quarters';
import type { CapacityOverhead, OverheadItem } from '@/lib/types';

function updateOverheadItem(items: OverheadItem[], itemId: string, value: number): OverheadItem[] {
  return items.map((item) => item.id === itemId ? { ...item, value } : item);
}

function cloneOverhead(overhead: CapacityOverhead): CapacityOverhead {
  return {
    items: overhead.items.map((item) => ({ ...item })),
  };
}

function uid() { return crypto.randomUUID(); }

function addOverheadItem(items: OverheadItem[], item: OverheadItem): OverheadItem[] {
  return [...items, item];
}

function removeOverheadItem(items: OverheadItem[], itemId: string): OverheadItem[] {
  return items.filter((item) => item.id !== itemId);
}

function overheadItemLabel(item: OverheadItem): string {
  return `${item.label} in ${item.type === 'pct' ? 'percentage' : 'weeks'}`;
}

export default function QuarterCapacityPlanningClient() {
  const { quarterId } = useParams<{ quarterId: string }>();
  const [newQuarterItemLabel, setNewQuarterItemLabel] = useState('');
  const [newQuarterItemType, setNewQuarterItemType] = useState<'pct' | 'weeks'>('pct');
  const [newQuarterItemValue, setNewQuarterItemValue] = useState('0');
  const [editingOverrideFor, setEditingOverrideFor] = useState<string | null>(null);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, CapacityOverhead>>({});

  const data = useLiveQuery(() => getCapacityPlanningData(quarterId), [quarterId]);

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!data.quarter) return <div className="text-sm text-zinc-400">Quarter not found.</div>;

  const { quarter, people, quarterPeople } = data;
  const engineerPeople = people.filter((person) => personTracksCapacity(person.role));
  const quarterPersonByPersonId = new Map(quarterPeople.map((quarterPerson) => [quarterPerson.personId, quarterPerson]));

  async function saveQuarterOverhead(itemId: string, value: number) {
    await updateQuarter(quarter.id, {
      overhead: { items: updateOverheadItem(quarter.overhead.items, itemId, value) },
    });
  }

  async function saveQuarterPersonCapacity(quarterPersonId: string, value: number) {
    await updateQuarterPerson(quarterPersonId, { quarterCapacity: Math.max(0, Math.min(100, Math.round(value))) });
  }

  async function enableOverride(quarterPersonId: string) {
    const draft = cloneOverhead(quarter.overhead);
    setOverrideDrafts((current) => ({ ...current, [quarterPersonId]: draft }));
    setEditingOverrideFor(quarterPersonId);
    await updateQuarterPerson(quarterPersonId, { overheadOverride: draft });
  }

  async function saveOverrideDraft(quarterPersonId: string) {
    const draft = overrideDrafts[quarterPersonId];
    if (!draft) return;
    await updateQuarterPerson(quarterPersonId, { overheadOverride: draft });
    setEditingOverrideFor(null);
  }

  async function resetOverrideToDefault(quarterPersonId: string) {
    setOverrideDrafts((current) => {
      const next = { ...current };
      delete next[quarterPersonId];
      return next;
    });
    setEditingOverrideFor(null);
    await updateQuarterPerson(quarterPersonId, { overheadOverride: null });
  }

  async function addQuarterOverheadItem() {
    const label = newQuarterItemLabel.trim();
    if (!label) return;
    const value = Number(newQuarterItemValue);
    await updateQuarter(quarter.id, {
      overhead: {
        items: addOverheadItem(quarter.overhead.items, {
          id: uid(),
          label,
          type: newQuarterItemType,
          value: Number.isFinite(value) ? value : 0,
        }),
      },
    });
    setNewQuarterItemLabel('');
    setNewQuarterItemType('pct');
    setNewQuarterItemValue('0');
  }

  async function removeQuarterOverheadItem(itemId: string) {
    await updateQuarter(quarter.id, {
      overhead: { items: removeOverheadItem(quarter.overhead.items, itemId) },
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Capacity Planning</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Quarter-level overhead applies to everyone by default. Override a person only when their quarter differs from the default.
            </p>
          </div>
          <Badge variant="info">{quarter.name}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {quarter.overhead.items.map((item) => (
            <label key={item.id} className="relative rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-2">
              <div className="text-sm font-medium text-zinc-200">{overheadItemLabel(item)}</div>
              <input
                type="number"
                defaultValue={item.value}
                min={0}
                max={item.type === 'pct' ? 100 : 13}
                step={item.type === 'pct' ? 1 : 0.5}
                onBlur={(event) => saveQuarterOverhead(item.id, Number(event.target.value))}
                className="w-full rounded border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
              />
              <button
                onClick={() => removeQuarterOverheadItem(item.id)}
                className="absolute top-2 right-2 text-xs text-zinc-600 hover:text-rose-400"
                title="Remove overhead item"
              >
                ✕
              </button>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <label className="text-xs text-zinc-500">
            <span className="mb-1 block">Label</span>
            <input
              value={newQuarterItemLabel}
              onChange={(event) => setNewQuarterItemLabel(event.target.value)}
              placeholder="e.g. Support"
              className="w-40 rounded border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
            />
          </label>
          <label className="text-xs text-zinc-500">
            <span className="mb-1 block">Type</span>
            <select
              value={newQuarterItemType}
              onChange={(event) => setNewQuarterItemType(event.target.value as 'pct' | 'weeks')}
              className="rounded border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
            >
              <option value="pct">Percent</option>
              <option value="weeks">Weeks</option>
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            <span className="mb-1 block">Value</span>
            <input
              type="number"
              value={newQuarterItemValue}
              min={0}
              max={newQuarterItemType === 'pct' ? 100 : 13}
              step={newQuarterItemType === 'pct' ? 1 : 0.5}
              onChange={(event) => setNewQuarterItemValue(event.target.value)}
              className="w-24 rounded border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
            />
          </label>
          <button
            onClick={addQuarterOverheadItem}
            className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Add item
          </button>
        </div>
      </section>

      {engineerPeople.length === 0 ? (
        <EmptyState
          title="No engineers in this quarter"
          description="Add engineers to the quarter before planning capacity."
        />
      ) : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">People</h3>
            <p className="text-xs text-zinc-500">Base capacity and overhead combine into effective capacity and available person-weeks.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Person</th>
                  <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Role</th>
                  <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Base %</th>
                  <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Effective %</th>
                  <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Avail PW</th>
                  <th className="py-3 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Override</th>
                </tr>
              </thead>
              <tbody>
                {engineerPeople.map((person) => {
                  const quarterPerson = quarterPersonByPersonId.get(person.id);
                  if (!quarterPerson) return null;
                  const summary = getQuarterPersonCapacitySummary(quarter, person, quarterPerson);
                  const overhead = summary.usesOverride ? summary.overhead : quarter.overhead;
                  const isEditingOverride = editingOverrideFor === quarterPerson.id;
                  const draftOverhead = overrideDrafts[quarterPerson.id] ?? overhead;
                  return (
                    <Fragment key={person.id}>
                      <tr key={person.id} className="border-b border-white/5 align-top">
                        <td className="py-3 pr-4">
                          <div className="font-medium text-zinc-100">{person.name}</div>
                        </td>
                        <td className="py-3 pr-4 text-zinc-400">{person.role}</td>
                        <td className="py-3 pr-4">
                          <input
                            type="number"
                            defaultValue={quarterPerson.quarterCapacity}
                            min={0}
                            max={100}
                            onBlur={(event) => saveQuarterPersonCapacity(quarterPerson.id, Number(event.target.value))}
                            className="w-20 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
                          />
                        </td>
                        <td className="py-3 pr-4 text-zinc-200 tabular-nums">{summary.effectiveCapacity}%</td>
                        <td className="py-3 pr-4 text-zinc-300 tabular-nums">{summary.availableWeeks}</td>
                        <td className="py-3 pr-0">
                          {!isEditingOverride && (
                            <button
                              onClick={() => summary.usesOverride ? setEditingOverrideFor(quarterPerson.id) : enableOverride(quarterPerson.id)}
                              className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                            >
                              Override
                            </button>
                          )}
                        </td>
                      </tr>
                      {isEditingOverride && (
                        <tr key={`${person.id}-override`} className="border-b border-white/5">
                          <td colSpan={6} className="pb-4 pt-0">
                            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Override</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => resetOverrideToDefault(quarterPerson.id)}
                                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/[0.08]"
                                  >
                                    Set to default
                                  </button>
                                  <button
                                    onClick={() => saveOverrideDraft(quarterPerson.id)}
                                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-white/[0.08]"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                                {draftOverhead.items.map((item) => (
                                  <label
                                    key={item.id}
                                    className="rounded-xl border border-white/10 bg-zinc-950/40 p-2 text-xs text-zinc-500"
                                  >
                                    <span className="mb-1 block text-zinc-300">{overheadItemLabel(item)}</span>
                                    <input
                                      type="number"
                                      value={item.value}
                                      min={0}
                                      max={item.type === 'pct' ? 100 : 13}
                                      step={item.type === 'pct' ? 1 : 0.5}
                                      onChange={(event) => {
                                        const value = Number(event.target.value);
                                        setOverrideDrafts((current) => ({
                                          ...current,
                                          [quarterPerson.id]: {
                                            items: updateOverheadItem(draftOverhead.items, item.id, Number.isFinite(value) ? value : 0),
                                          },
                                        }));
                                      }}
                                      className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-400/60"
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
