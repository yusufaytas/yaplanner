// ─── Global Persistent Entities ──────────────────────────────────────────────
// These exist independently of any quarter. A project can span many quarters.

export interface Person {
  id: string;
  name: string;
  email: string | null;
  role: string; // e.g. "Engineer", "EM", "PM"
  defaultCapacity: number; // default 100 (percent)
  subteamId: string | null; // default subteam
  notes: string;
  createdAt: string;
}

export interface Subteam {
  id: string;
  name: string;
  purpose: string | null;
  driPersonId: string | null;
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
  owningSubteamId: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface ProjectLink {
  id: string;
  projectId: string;
  label: string;
  url: string;
}

export interface ProjectStakeholder {
  id: string;
  quarterId: string;
  projectId: string;
  personId: string;
}

// ─── Quarter Planning Entities ────────────────────────────────────────────────
// Scoped to a specific planning cycle.

export type QuarterStatus = 'draft' | 'active' | 'closed' | 'archived';

/** A single overhead item — e.g. "Meetings", "oncall", "Learning" */
export interface OverheadItem {
  id: string;       // stable key, e.g. "meetings" or a uuid for custom ones
  label: string;    // display name
  type: 'pct' | 'weeks'; // percentage of time, or weeks out of the quarter
  value: number;    // 0–100 for pct, 0–N for weeks
}

/** Quarter-wide overhead defaults — a list of overhead items applied to every person unless overridden */
export interface CapacityOverhead {
  items: OverheadItem[];
}

export interface Quarter {
  id: string;
  name: string; // e.g. "2026-Q3"
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string; // ISO date YYYY-MM-DD
  status: QuarterStatus;
  createdAt: string;
  createdFromQuarterId: string | null;
  /** Index after which the capacity line is drawn in the priority-sorted list. null = no line set. */
  capacityLineAfter: number | null;
  /** Quarter-wide overhead defaults */
  overhead: CapacityOverhead;
}

/** Per-quarter project planning data */
export interface QuarterProject {
  id: string;
  quarterId: string;
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
export interface QuarterPerson {
  id: string;
  quarterId: string;
  personId: string; // references global Person
  subteamId: string | null; // subteam assignment for this quarter
  inactive: boolean;
  quarterCapacity: number; // base capacity % for this quarter (default 100)
  /**
   * Per-person overhead override. null = use quarter defaults.
   * When set, replaces the quarter overhead list entirely for this person.
   * Persons can have completely different items from the quarter defaults.
   */
  overheadOverride: CapacityOverhead | null;
}

export type ProjectRoleType = 'DRI' | 'EM' | 'PM' | 'Engineer';

export interface ProjectRole {
  id: string;
  quarterId: string;
  projectId: string;
  personId: string;
  role: ProjectRoleType;
}

export interface Allocation {
  id: string;
  quarterId: string;
  personId: string;
  projectId: string;
  weekStart: string; // ISO date (Monday of the week)
  percentage: number; // 1–100 inclusive
}

export interface Unknown {
  id: string;
  projectId: string;
  quarterId: string;
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
  projectId: string;
  quarterId: string;
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
 *   - type 'weeks': multiplies by (1 - value/totalQuarterWeeks)
 *
 * Items are applied sequentially (compounding), matching how real overhead works.
 */
export function computeEffectiveCapacity(
  baseCapacity: number,
  overhead: CapacityOverhead,
  totalQuarterWeeks: number,
): number {
  let effective = baseCapacity;
  for (const item of overhead.items) {
    if (item.type === 'pct') {
      effective *= 1 - item.value / 100;
    } else {
      const fraction = totalQuarterWeeks > 0 ? item.value / totalQuarterWeeks : 0;
      effective *= 1 - fraction;
    }
  }
  return Math.max(0, Math.round(effective));
}

/** Resolve the overhead to use for a person — person override takes full precedence if set */
export function resolveOverhead(
  quarterOverhead: CapacityOverhead,
  personOverride: CapacityOverhead | null,
): CapacityOverhead {
  return personOverride ?? quarterOverhead;
}

/** Default overhead items used when creating a new quarter */
export const DEFAULT_OVERHEAD_ITEMS: OverheadItem[] = [
  { id: 'pto',      label: 'PTO',       type: 'weeks', value: 1  },
  { id: 'meetings', label: 'Meetings',  type: 'pct',   value: 10 },
  { id: 'oncall',   label: 'oncall',     type: 'pct',   value: 0  },
  { id: 'learning', label: 'Learning',  type: 'pct',   value: 5  },
];
