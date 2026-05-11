# Yaplanner

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

A browser-only, local-first resourcing planner for engineering managers.

All data stays in your browser via IndexedDB. No backend and no telemetry. Export and import your full plan as a JSON file, and optionally store backups in Google Drive.

## What it does

- **People, subteams, and projects** are global — they exist across quarters
- **Quarters** are planning lenses: allocations, capacity, and warnings are all quarter-scoped
- A project can span many quarters, with per-quarter estimated and allocated person-weeks tracked separately
- Percentage-based allocation per person per project, with start and end dates
- Capacity planning with overhead items (PTO, meetings, oncall, etc.) applied at the quarter level, with per-person overrides
- Project health signal (green / yellow / red) derived from open risks, unknowns, and over-capacity delivery members
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

All allocation math uses **effective capacity**, not base capacity.

That means:
- `quarterPerson.quarterCapacity` sets the base for that quarter
- quarter overhead or person overhead override reduces that to `effectivePct`
- project allocation percentages are constrained against that effective capacity
- if a person is over effective capacity, the UI shows them as over capacity and project health rises to at least yellow

Project reserved person-weeks are computed from explicit `Allocation` rows:

```text
projectReservedPW = availablePW × (allocationPct / effectivePct)
```

If a person has `effectivePct = 40` and is allocated `10` to a project, that project is consuming 25% of their usable quarter capacity.

## Engineer assignment rules

An engineer only appears in the project assignment dropdown if:
- They have a `QuarterPerson` record for the active quarter (added via the People tab)
- They are not marked inactive
- Their remaining capacity after existing project allocations is > 0

## Planning rules

- A project has exactly one owning subteam via `project.subteamId`.
- A subteam is the current delivery snapshot: one `DRI` and zero or more `Engineer`s.
- `EM`, `PM`, and `Stakeholder` are part of the delivery team, but they are not part of the subteam.
- Delivery-team history is stored in `allocations`. There is no separate project-role or subteam-member table.
- If a delivery person is added to one project in a subteam, they are materialized across every sibling project in that same subteam.
- Sibling-project propagation only applies to delivery roles: `DRI` and `Engineer`.
- `EM`, `PM`, and `Stakeholder` stay project-specific.
- Every project must have a `DRI`.
- `percentage` on `Allocation` is project share of the person’s effective quarter capacity.
- `startDate` / `endDate` on `Allocation` preserve history.
- Removing someone from a project normally ends their active allocation rows instead of deleting them.
- Short-lived mistaken assignments are not preserved as history: if an active allocation started less than 7 days ago, removing that person deletes the allocation instead of end-dating it.
- Completed projects show all involved people directly in the team list, including ended allocations.
- Project links, unknowns, and risks are embedded on the `Project` record, not stored as separate tables.

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

Current tables:

**Global**
- `people`
- `subteams`
- `projects`

**Quarter-scoped**
- `quarters`
- `quarterProjects`
- `quarterPeople`
- `allocations`

Key relationships:
- `Project.subteamId` points to the owning subteam
- `QuarterProject` stores quarter-specific planning data for a project
- `QuarterPerson` stores quarter-specific capacity and overhead overrides for a person
- `Allocation` stores both current and historical project membership, role, and capacity share over time

All data lives in IndexedDB in the browser. Nothing is sent to any server.
