import type { Unknown, Risk } from './types';

export type ProjectHealth = 'green' | 'yellow' | 'red';

/**
 * Derive a RAG health signal for a project from its open risks and unknowns.
 *
 * Red    — any open risk with High likelihood OR High impact
 * Yellow — any open unknown, or any open risk with Medium likelihood/impact
 * Green  — no open risks, no open unknowns
 */
export function computeProjectHealth(
  unknowns: Pick<Unknown, 'resolved'>[],
  risks: Pick<Risk, 'mitigated' | 'likelihood' | 'impact'>[],
): ProjectHealth {
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

export const healthDot: Record<ProjectHealth, { bg: string; title: string }> = {
  green:  { bg: 'bg-emerald-400', title: 'On track'         },
  yellow: { bg: 'bg-amber-400',   title: 'At risk'          },
  red:    { bg: 'bg-rose-500',    title: 'High risk / issue' },
};
