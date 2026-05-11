import type { ProjectStatus, Unknown, Risk } from './types';

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
  if (hasMediumRisk || openUnknowns.length > 0) return 'yellow';

  return 'green';
}

export function buildProjectHealthMap(
  projects: Array<{ id: string; status: ProjectStatus }>,
  unknowns: Unknown[],
  risks: Risk[],
): Map<string, ProjectHealth> {
  const unknownsByProject = new Map<string, Unknown[]>();
  for (const unknown of unknowns) {
    const entries = unknownsByProject.get(unknown.projectId) ?? [];
    entries.push(unknown);
    unknownsByProject.set(unknown.projectId, entries);
  }

  const risksByProject = new Map<string, Risk[]>();
  for (const risk of risks) {
    const entries = risksByProject.get(risk.projectId) ?? [];
    entries.push(risk);
    risksByProject.set(risk.projectId, entries);
  }

  const healthByProject = new Map<string, ProjectHealth>();
  for (const project of projects) {
    healthByProject.set(
      project.id,
      computeProjectHealth(
        project.status,
        unknownsByProject.get(project.id) ?? [],
        risksByProject.get(project.id) ?? [],
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
    description: 'There is at least one open unknown or medium-severity risk.',
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
