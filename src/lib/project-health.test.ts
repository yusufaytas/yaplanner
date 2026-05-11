import { describe, expect, it } from 'vitest';
import { buildProjectHealthMap, computeProjectHealth, projectHealthMeta } from './project-health';

describe('project health', () => {
  it('marks proposed projects as not started even with no risks', () => {
    expect(computeProjectHealth('Proposed', [], [])).toBe('blue');
  });

  it('keeps proposed projects as not started even if unknowns or risks exist', () => {
    expect(computeProjectHealth(
      'Proposed',
      [{ resolved: false }],
      [{ mitigated: false, likelihood: 'High', impact: 'High' }],
    )).toBe('blue');
  });

  it('marks active projects with no open issues as on track', () => {
    expect(computeProjectHealth('Active', [], [])).toBe('green');
  });

  it('marks active projects with open unknowns as at risk', () => {
    expect(computeProjectHealth('Active', [{ resolved: false }], [])).toBe('yellow');
  });

  it('marks active projects with high risks as high risk', () => {
    expect(computeProjectHealth(
      'Active',
      [],
      [{ mitigated: false, likelihood: 'High', impact: 'Low' }],
    )).toBe('red');
  });

  it('exposes centralized metadata for each health state', () => {
    expect(projectHealthMeta.blue.label).toBe('Not started');
    expect(projectHealthMeta.green.label).toBe('On track');
    expect(projectHealthMeta.yellow.label).toBe('At risk');
    expect(projectHealthMeta.red.label).toBe('High risk');
  });

  it('builds project health once per project from unknown and risk lists', () => {
    const healthByProject = buildProjectHealthMap(
      [
        { id: 'p1', status: 'Proposed' },
        { id: 'p2', status: 'Active' },
        { id: 'p3', status: 'Active' },
      ],
      [
        {
          id: 'u1',
          projectId: 'p2',
          quarterId: 'q1',
          title: 'Dependency',
          description: '',
          resolved: false,
          resolvedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      [
        {
          id: 'r1',
          projectId: 'p3',
          quarterId: 'q1',
          title: 'Scope',
          likelihood: 'High',
          impact: 'Low',
          mitigationNote: '',
          mitigated: false,
          mitigatedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    );

    expect(healthByProject.get('p1')).toBe('blue');
    expect(healthByProject.get('p2')).toBe('yellow');
    expect(healthByProject.get('p3')).toBe('red');
  });
});
