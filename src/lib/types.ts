export type Role = 'Engineer' | 'DRI' | 'EM' | 'PM' | 'Stakeholder';

// ─── Global Persistent Entities ──────────────────────────────────────────────
// These exist independently of any quarter. A project can span many quarters.

export interface Person {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  defaultCapacity: number; // default 100 (percent)
  subteamId: string | null;
  notes: string;
  createdAt: string;
}

export interface Subteam {
  id: string;
  name: string;
  purpose: string | null;
  createdAt: string;
}

export type ProjectStatus =
  | 'Proposed'
  | 'Active'
  | 'On Hold'
  | 'Complete'
  | 'Cancelled';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  tags: string[];
  subteamId: string | null;
  createdAt: string;
  archivedAt: string | null;
  links: ProjectLink[];
  unknowns: Unknown[];
  risks: Risk[];
}

export interface ProjectLink {
  id: string;
  label: string;
  url: string;
}

// ─── Cycle Planning Entities ────────────────────────────────────────────────
// Scoped to a specific planning cycle.

export type CycleStatus = 'draft' | 'active' | 'closed' | 'archived';

/** A single overhead item — e.g. "Meetings", "oncall", "Learning" */
export interface OverheadItem {
  id: string;       // stable key, e.g. "meetings" or a uuid for custom ones
  label: string;    // display name
  type: 'pct' | 'weeks'; // percentage of time, or weeks out of the quarter
  value: number;    // 0–100 for pct, 0–N for weeks
}

/** Cycle-wide overhead defaults — a list of overhead items applied to every person unless overridden */
export interface CapacityOverhead {
  items: OverheadItem[];
}

export interface Cycle {
  id: string;
  name: string; // e.g. "2026-Q3"
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string; // ISO date YYYY-MM-DD
  status: CycleStatus;
  createdAt: string;
  createdFromCycleId: string | null;
  /** Index after which the capacity line is drawn in the priority-sorted list. null = no line set. */
  capacityLineAfter: number | null;
  /** Cycle-wide overhead defaults */
  overhead: CapacityOverhead;
}

/** Per-quarter project planning data */
export interface CycleProject {
  id: string;
  cycleId: string;
  projectId: string; // references global Project
  status: ProjectStatus;
  priority: number | null; // sort order within the quarter portfolio (lower = higher priority)
  estimatedPersonWeeks: number | null;
  notes: string;
  plannedStartWeek: string | null;
  plannedEndWeek: string | null;
  targetMilestone: string | null;
}

/** Per-quarter person planning data */
export interface CyclePerson {
  id: string;
  cycleId: string;
  personId: string; // references global Person
  subteamId: string | null; // subteam assignment for this quarter
  inactive: boolean;
  cycleCapacity: number; // base capacity % for this quarter (default 100)
  /**
   * Per-person overhead override. null = use quarter defaults.
   * When set, replaces the quarter overhead list entirely for this person.
   * Persons can have completely different items from the quarter defaults.
   */
  overheadOverride: CapacityOverhead | null;
}

export interface Allocation {
  id: string;
  cycleId: string | null;
  personId: string;
  projectId: string | null;
  role: Role;
  startDate: string | null;
  endDate: string | null;
  percentage: number; // 1–100 inclusive
}

export interface Unknown {
  id: string;
  cycleId: string;
  title: string;
  description: string; // supports @ mentions
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export type RiskLikelihood = 'Low' | 'Medium' | 'High';
export type RiskImpact = 'Low' | 'Medium' | 'High';

export interface Risk {
  id: string;
  cycleId: string;
  title: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  mitigationNote: string; // supports @ mentions
  mitigated: boolean;
  mitigatedAt: string | null;
  createdAt: string;
}

// ─── Capacity types ───────────────────────────────────────────────────────────

/**
 * Compute effective capacity % after applying a list of overhead items.
 *
 * Each item reduces the remaining capacity:
 *   - type 'pct':   multiplies by (1 - value/100)
 *   - type 'weeks': multiplies by (1 - value/totalCycleWeeks)
 *
 * Items are applied sequentially (compounding), matching how real overhead works.
 */
export function computeEffectiveCapacity(
  baseCapacity: number,
  overhead: CapacityOverhead,
  totalCycleWeeks: number,
): number {
  let effective = baseCapacity;
  for (const item of overhead.items) {
    if (item.type === 'pct') {
      effective *= 1 - item.value / 100;
    } else {
      const fraction = totalCycleWeeks > 0 ? item.value / totalCycleWeeks : 0;
      effective *= 1 - fraction;
    }
  }
  return Math.max(0, Math.round(effective));
}

/** Resolve the overhead to use for a person — person override takes full precedence if set */
export function resolveOverhead(
  cycleOverhead: CapacityOverhead,
  personOverride: CapacityOverhead | null,
): CapacityOverhead {
  return personOverride ?? cycleOverhead;
}

/** Default overhead items used when creating a new quarter */
export const DEFAULT_OVERHEAD_ITEMS: OverheadItem[] = [
  { id: 'pto',      label: 'PTO',       type: 'weeks', value: 1  },
  { id: 'meetings', label: 'Meetings',  type: 'pct',   value: 10 },
  { id: 'oncall',   label: 'oncall',     type: 'pct',   value: 0  },
  { id: 'learning', label: 'Learning',  type: 'pct',   value: 5  },
];
