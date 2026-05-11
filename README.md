# Yaplanner

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

A browser-only, local-first resourcing planner for engineering managers.

All data stays in your browser via IndexedDB. No backend and no telemetry. Export and import your full plan as a JSON file, and optionally store backups in Google Drive.

## What it does

- **People, subteams, and projects** are global — they exist across quarters
- **Quarters** are planning lenses: allocations, capacity, and warnings are all quarter-scoped
- A project can span many quarters, with per-quarter estimated and allocated person-weeks tracked separately
- Weekly percentage-based allocation per person per project
- Capacity planning with overhead items (PTO, meetings, oncall, etc.) applied at the quarter level, with per-person overrides
- Project health signal (green / yellow / red) derived from open risks and unknowns
- Engineer availability filter — only engineers with remaining capacity appear in project assignment dropdowns
- Export full data as JSON; import to restore or share
- Optional Google Drive backup sync using a visible `Yaplanner` folder

## Stack

- [Next.js](https://nextjs.org) (App Router, client-side only)
- [TypeScript](https://www.typescriptlang.org)
- [Dexie](https://dexie.org) — IndexedDB wrapper with reactive live queries
- [Tailwind CSS v4](https://tailwindcss.com)
- [Vitest](https://vitest.dev) — unit tests

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first load the app is empty — click **Load sample data** on the overview page to populate it, or use **Import** in the top nav to load a previously exported file.

To enable Google Drive sync, create a `.env.local` file with:

```bash
NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

In Google Cloud, create a Web OAuth client and add your app URL to **Authorized JavaScript origins**. For local development this typically includes `http://localhost:3000`.

## Routes

| Route | Description |
|---|---|
| `/` | Overview — active projects and leadership |
| `/people` | All people |
| `/people/[id]` | Person profile — projects, capacity allocation, notes |
| `/subteams` | All subteams |
| `/subteams/[id]` | Subteam detail |
| `/projects` | All projects |
| `/projects/[id]` | Project page — health, quarter planning, delivery team, risks, unknowns |
| `/quarters` | Quarter list |
| `/quarters/[id]` | Portfolio dashboard — priority-ordered project list with capacity line |
| `/quarters/[id]/capacity-planning` | Quarter overhead and per-person capacity overrides |
| `/quarters/[id]/people` | Add/remove engineers from a quarter, view estimated vs allocated person-weeks |

## Capacity model

Person-weeks available per engineer per quarter:

```
baseCapacity = quarterPerson.quarterCapacity ?? person.defaultCapacity
overhead     = quarterPerson.overheadOverride ?? quarter.overhead
effectivePct = baseCapacity × ∏(1 - overhead_item)
availablePW  = quarterWeeks × effectivePct / 100
```

Overhead items compound sequentially. A `pct` item reduces by percentage; a `weeks` item converts weeks-out-of-quarter to a fraction.

Project allocation per engineer is derived from explicit `Allocation` records (weekly %) averaged across the quarter. If no allocations exist, remaining capacity is split evenly across assigned projects (with a 50% floor for DRIs).

## Engineer assignment rules

An engineer only appears in the project assignment dropdown if:
- They have a `QuarterPerson` record for the active quarter (added via the People tab)
- They are not marked inactive
- Their remaining capacity after existing project allocations is > 0

## Import / Export / Drive Sync

**Export** (top nav) — dumps all tables to a timestamped JSON file:
```json
{ "version": 1, "exportedAt": "...", "data": { "people": [...], "projects": [...], ... } }
```

**Import** (top nav) — reads a JSON file, clears all tables, and restores from the file. Full replace, not a merge.

**Sync** (top nav) — optionally signs into Google and stores the same backup JSON in `Google Drive/Yaplanner/yaplanner-backup.json`.

The first save creates that file and gives you a Drive URL. Share that URL with anyone else who should use the same backup. To restore, they paste the shared file URL or file ID into the Sync modal, click **Use Link**, then **Restore from provided link**. Restore is still a full replace.

Auto-sync is optional and runs every few minutes while the app tab is open.

## Development

```bash
npm run dev        # development server
npm run build      # production build
npm run test       # run tests once
npm run lint       # lint
```

## Data model

Two-layer model:

**Global** (cross-quarter): `people`, `subteams`, `projects`, `projectLinks`, `projectUpdates`, `projectStakeholders`

**Quarter-scoped**: `quarters`, `quarterProjects`, `quarterPeople`, `projectRoles`, `allocations`, `availabilityRecords`, `headcountEvents`, `unknowns`, `risks`, `decisionLogEntries`, `snapshots`

All data lives in IndexedDB in the browser. Nothing is sent to any server.
