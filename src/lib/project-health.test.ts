import { describe, expect, it } from 'vitest';
import { buildProjectHealthMap, computeProjectHealth, getOverAllocatedProjectIds, projectHealthMeta } from './project-health';

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

  it('marks active projects with over-capacity delivery members as at risk', () => {
    expect(computeProjectHealth('Active', [], [], true)).toBe('yellow');
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

  it('marks clean active projects as at risk when a delivery member is over capacity', () => {
    const quarter = {
      id: 'q1',
      name: '2026-Q2',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      status: 'active',
      createdAt: '2026-03-01T00:00:00.000Z',
      createdFromQuarterId: null,
      capacityLineAfter: null,
      overhead: { items: [] },
    } as const;
    const ben = {
      id: 'ben',
      name: 'Ben',
      email: null,
      role: 'Engineer',
      defaultCapacity: 100,
      subteamId: null,
      notes: '',
      createdAt: '2026-03-01T00:00:00.000Z',
    } as const;
    const quarterPeople = [
      {
        id: 'qp-ben',
        quarterId: quarter.id,
        personId: ben.id,
        subteamId: null,
        inactive: false,
        quarterCapacity: 80,
        overheadOverride: null,
      },
    ];
    const allocations = [
      {
        id: 'a1',
        quarterId: quarter.id,
        projectId: 'p-clean',
        personId: ben.id,
        role: 'Engineer',
        startDate: quarter.startDate,
        endDate: null,
        percentage: 50,
      },
      {
        id: 'a2',
        quarterId: quarter.id,
        projectId: 'p-second',
        personId: ben.id,
        role: 'Engineer',
        startDate: quarter.startDate,
        endDate: null,
        percentage: 40,
      },
    ];

    const overAllocatedProjectIds = getOverAllocatedProjectIds({
      quarter,
      people: [ben],
      quarterPeople,
      allocations,
    });
    const healthByProject = buildProjectHealthMap(
      [
        { id: 'p-clean', status: 'Active', unknowns: [], risks: [] },
        { id: 'p-second', status: 'Active', unknowns: [], risks: [] },
      ],
      undefined,
      undefined,
      overAllocatedProjectIds,
    );

    expect(overAllocatedProjectIds).toEqual(new Set(['p-clean', 'p-second']));
    expect(healthByProject.get('p-clean')).toBe('yellow');
    expect(healthByProject.get('p-second')).toBe('yellow');
  });
});
