import { getCyclePersonProjectSummary } from './person-capacity';
import type { Allocation, Person, Project, ProjectStatus, Cycle, CyclePerson, Unknown, Risk } from './types';

export type ProjectHealth = 'blue' | 'green' | 'yellow' | 'red';

/**
 * Derive a RAG health signal for a project from its open risks and unknowns.
 *
 * Red    — any open risk with High likelihood OR High impact
 * Yellow — any open unknown, or any open risk with Medium likelihood/impact
 * Green  — no open risks, no open unknowns
 */
export function computeProjectHealth(
  status: ProjectStatus,
  unknowns: Pick<Unknown, 'resolved'>[],
  risks: Pick<Risk, 'mitigated' | 'likelihood' | 'impact'>[],
  hasOverAllocatedPeople = false,
): ProjectHealth {
  if (status === 'Proposed') return 'blue';

  const openRisks = risks.filter((r) => !r.mitigated);
  const openUnknowns = unknowns.filter((u) => !u.resolved);

  const hasHighRisk = openRisks.some(
    (r) => r.likelihood === 'High' || r.impact === 'High',
  );
  if (hasHighRisk) return 'red';

  const hasMediumRisk = openRisks.some(
    (r) => r.likelihood === 'Medium' || r.impact === 'Medium',
  );
  if (hasMediumRisk || openUnknowns.length > 0 || hasOverAllocatedPeople) return 'yellow';

  return 'green';
}

export function getOverAllocatedProjectIds(params: {
  quarter: Cycle;
  people: Person[];
  cyclePeople: CyclePerson[];
  allocations: Allocation[];
}): Set<string> {
  const { quarter, people, cyclePeople, allocations } = params;
  const overAllocatedProjectIds = new Set<string>();

  for (const person of people) {
    const cyclePerson = cyclePeople.find(
      (entry) => entry.personId === person.id && entry.cycleId === quarter.id,
    );
    const summary = getCyclePersonProjectSummary(quarter, person, cyclePerson, allocations);
    if (!summary.tracksCapacity || !summary.overAllocated) continue;

    for (const allocation of allocations) {
      if (
        allocation.personId === person.id &&
        allocation.cycleId === quarter.id &&
        allocation.projectId &&
        allocation.endDate === null &&
        (allocation.role === 'Engineer' || allocation.role === 'DRI')
      ) {
        overAllocatedProjectIds.add(allocation.projectId);
      }
    }
  }

  return overAllocatedProjectIds;
}

export function buildProjectHealthMap(
  projects: Array<Pick<Project, 'id' | 'status'> & Partial<Pick<Project, 'unknowns' | 'risks'>>>,
  unknowns?: Array<Unknown & { projectId?: string }>,
  risks?: Array<Risk & { projectId?: string }>,
  overAllocatedProjectIds?: Set<string>,
): Map<string, ProjectHealth> {
  const unknownsByProject = new Map<string, Unknown[]>();
  const risksByProject = new Map<string, Risk[]>();

  if (unknowns) {
    for (const unknown of unknowns) {
      if (!unknown.projectId) continue;
      const entries = unknownsByProject.get(unknown.projectId) ?? [];
      entries.push(unknown);
      unknownsByProject.set(unknown.projectId, entries);
    }
  }

  if (risks) {
    for (const risk of risks) {
      if (!risk.projectId) continue;
      const entries = risksByProject.get(risk.projectId) ?? [];
      entries.push(risk);
      risksByProject.set(risk.projectId, entries);
    }
  }

  const healthByProject = new Map<string, ProjectHealth>();
  for (const project of projects) {
    healthByProject.set(
      project.id,
      computeProjectHealth(
        project.status,
        project.unknowns ?? unknownsByProject.get(project.id) ?? [],
        project.risks ?? risksByProject.get(project.id) ?? [],
        overAllocatedProjectIds?.has(project.id) ?? false,
      ),
    );
  }

  return healthByProject;
}

export const projectHealthMeta: Record<ProjectHealth, {
  label: string;
  description: string;
  dotBg: string;
  dotShadow: string;
  pillClassName: string;
}> = {
  blue: {
    label: 'Not started',
    description: 'Project is proposed and has not started yet.',
    dotBg: 'bg-sky-400',
    dotShadow: 'shadow-sky-400/40',
    pillClassName: 'bg-sky-500/20 text-sky-300',
  },
  green: {
    label: 'On track',
    description: 'No open risks or unknowns.',
    dotBg: 'bg-emerald-400',
    dotShadow: 'shadow-emerald-400/40',
    pillClassName: 'bg-emerald-500/20 text-emerald-300',
  },
  yellow: {
    label: 'At risk',
    description: 'There is at least one open unknown, medium-severity risk, or over-capacity delivery member.',
    dotBg: 'bg-amber-400',
    dotShadow: 'shadow-amber-400/40',
    pillClassName: 'bg-amber-500/20 text-amber-300',
  },
  red: {
    label: 'High risk',
    description: 'There is at least one high-severity open risk.',
    dotBg: 'bg-rose-500',
    dotShadow: 'shadow-rose-500/50',
    pillClassName: 'bg-rose-500/20 text-rose-300',
  },
};
