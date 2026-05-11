'use client';

import { useState } from 'react';
import { projectHealthMeta } from '@/lib/project-health';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">{title}</h3>
      <div className="space-y-1.5 text-sm text-zinc-300">{children}</div>
    </div>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed">{children}</p>;
}

function Tag({ children, color = 'zinc' }: { children: React.ReactNode; color?: 'sky' | 'emerald' | 'amber' | 'rose' | 'zinc' }) {
  const colors = {
    sky:     'bg-sky-500/20 text-sky-300',
    emerald: 'bg-emerald-500/20 text-emerald-300',
    amber:   'bg-amber-500/20 text-amber-300',
    rose:    'bg-rose-500/20 text-rose-300',
    zinc:    'bg-zinc-700/50 text-zinc-300',
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

export function UserGuideModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        User guide
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-zinc-950 px-6 py-4">
              <h2 className="text-base font-semibold text-zinc-100">User guide</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 text-lg leading-none"
                aria-label="Close"
              >✕</button>
            </div>

            <div className="space-y-8 px-6 py-6">

              {/* Overview */}
              <Section title="What is Yaplanner?">
                <Rule>
                  A local-first resourcing planner for engineering managers. All data lives in your
                  browser — no server, no sync, no telemetry. Use <strong className="text-zinc-100">Export</strong> and{' '}
                  <strong className="text-zinc-100">Import</strong> in the top nav to back up or share your plan.
                </Rule>
                <Rule>
                  <strong className="text-zinc-100">People, subteams, and projects</strong> are global — they persist
                  across quarters. <strong className="text-zinc-100">Quarters</strong> are planning lenses: capacity,
                  allocations, and health signals are all quarter-scoped.
                </Rule>
              </Section>

              {/* Getting started */}
              <Section title="Getting started">
                <Rule>1. Create your <strong className="text-zinc-100">People</strong> and assign each a role (Engineer, EM, PM).</Rule>
                <Rule>2. Create a <strong className="text-zinc-100">Quarter</strong> with a start and end date, then add people to it via the quarter&apos;s People tab.</Rule>
                <Rule>3. Create <strong className="text-zinc-100">Projects</strong> and add them to the quarter via the portfolio dashboard.</Rule>
                <Rule>4. On each project page, assign a <strong className="text-zinc-100">DRI</strong> first, then add Engineers and other roles.</Rule>
                <Rule>5. Set capacity allocations per engineer and an estimated person-weeks budget per project.</Rule>
              </Section>

              {/* Roles */}
              <Section title="Project roles">
                <Rule>
                  Each project has four role types:{' '}
                  <Tag color="sky">DRI</Tag>{' '}
                  <Tag>Engineer</Tag>{' '}
                  <Tag>EM</Tag>{' '}
                  <Tag>PM</Tag>
                </Rule>
                <Rule>
                  <strong className="text-zinc-100">DRI</strong> (Directly Responsible Individual) must be assigned
                  before any Engineers can be added. There can only be one DRI per project.
                </Rule>
                <Rule>
                  The same person cannot hold multiple roles on the same project.
                </Rule>
                <Rule>
                  Assigning a DRI automatically creates or links a subteam for the project and sets that person as the subteam DRI.
                </Rule>
                <Rule>
                  Only Engineers track capacity allocation. EM and PM roles are informational.
                </Rule>
              </Section>

              {/* Capacity */}
              <Section title="Capacity planning">
                <Rule>
                  Each person has a <strong className="text-zinc-100">default capacity</strong> (100% by default).
                  This can be overridden per quarter on the capacity planning page.
                </Rule>
                <Rule>
                  <strong className="text-zinc-100">Overhead items</strong> reduce available capacity. They compound
                  sequentially — e.g. 1 week PTO + 10% meetings + 5% learning applied to 13 weeks gives roughly
                  10.2 available person-weeks, not 13 × (1 − 0.23).
                </Rule>
                <Rule>
                  Overhead can be set at the quarter level (applies to everyone) or overridden per person. A
                  person-level override <em>replaces</em> the quarter defaults entirely — it doesn&apos;t add to them.
                </Rule>
                <Rule>
                  <strong className="text-zinc-100">Allocation</strong> is a weekly percentage per engineer per project.
                  If no explicit allocation is set, remaining capacity is split evenly across assigned projects.
                </Rule>
                <Rule>
                  A DRI who is also an Engineer has a minimum allocation of <strong className="text-zinc-100">50%</strong> on that project.
                </Rule>
                <Rule>
                  Only engineers with a QuarterPerson record, not marked inactive, and with remaining capacity &gt; 0
                  appear in the assignment dropdown.
                </Rule>
              </Section>

              {/* Health */}
              <Section title="Project health">
                <Rule>
                  Health is derived from open <strong className="text-zinc-100">risks</strong> and{' '}
                  <strong className="text-zinc-100">unknowns</strong> on the project:
                </Rule>
                <div className="space-y-1">
                  <p><Tag color="sky">{`● ${projectHealthMeta.blue.label}`}</Tag> — {projectHealthMeta.blue.description}</p>
                  <p><Tag color="rose">{`● ${projectHealthMeta.red.label}`}</Tag> — {projectHealthMeta.red.description}</p>
                  <p><Tag color="amber">{`● ${projectHealthMeta.yellow.label}`}</Tag> — {projectHealthMeta.yellow.description}</p>
                  <p><Tag color="emerald">{`● ${projectHealthMeta.green.label}`}</Tag> — {projectHealthMeta.green.description}</p>
                </div>
                <Rule>
                  Resolve unknowns and mitigate risks to improve the health signal.
                </Rule>
              </Section>

              {/* Portfolio */}
              <Section title="Portfolio dashboard">
                <Rule>
                  The quarter&apos;s portfolio view shows all projects in priority order. Drag to reorder.
                </Rule>
                <Rule>
                  The <strong className="text-zinc-100">capacity line</strong> is an optional marker you can set to
                  visually separate projects that fit within capacity from those that don&apos;t.
                </Rule>
                <Rule>
                  Each project row shows reserved vs. estimated person-weeks. A progress bar turns red when
                  reserved exceeds the estimate.
                </Rule>
              </Section>

              {/* Import / Export */}
              <Section title="Import, export & sync">
                <Rule>
                  <strong className="text-zinc-100">Export</strong> saves all your data as a JSON file — useful for
                  backups or sharing with another browser.
                </Rule>
                <Rule>
                  <strong className="text-zinc-100">Import</strong> is a full replace: it clears all existing data
                  and restores from the file. It is not a merge.
                </Rule>
                <Rule>
                  <strong className="text-zinc-100">Sync</strong> saves a backup file to Google Drive at{' '}
                  <strong className="text-zinc-100">Yaplanner/yaplanner-backup.json</strong>.
                </Rule>
                <Rule>
                  The first person saves the backup, then shares that Google Drive file URL. Anyone restoring must
                  paste that file URL or file ID into the Sync modal first, then use <strong className="text-zinc-100">Restore from provided link</strong>.
                </Rule>
                <Rule>
                  If the file is moved in Drive, the shared file URL or file ID still identifies the same backup target.
                </Rule>
                <Rule>
                  <strong className="text-zinc-100">Auto-sync</strong> only runs while the app tab is open.
                </Rule>
              </Section>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
