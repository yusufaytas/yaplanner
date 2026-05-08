import { describe, expect, it } from 'vitest';
import {
  getProjectCapacitySummary,
  getQuarterCapacitySummary,
  getQuarterPersonAvailableWeeks,
  getQuarterPersonCapacitySummary,
  getAssignableEngineers,
} from './quarter-capacity';
import type { Allocation, Person, ProjectRole, Quarter, QuarterPerson } from './types';

const quarter: Quarter = {
  id: 'quarter-1',
  name: '2026-Q3',
  startDate: '2026-06-29',
  endDate: '2026-09-27',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdFromQuarterId: null,
  capacityLineAfter: null,
  overhead: {
    items: [
      { id: 'pto', label: 'PTO', type: 'weeks', value: 1 },
      { id: 'meetings', label: 'Meetings', type: 'pct', value: 10 },
    ],
  },
};

describe('quarter capacity', () => {
  it('computes available person-weeks after quarter overhead', () => {
    const person: Person = {
      id: 'eng-1',
      name: 'Engineer One',
      email: null,
      role: 'Engineer',
      defaultCapacity: 100,
      subteamId: null,
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const quarterPerson: QuarterPerson = {
      id: 'qp-1',
      quarterId: 'quarter-1',
      personId: 'eng-1',
      subteamId: null,
      inactive: false,
      quarterCapacity: 100,
      overheadOverride: null,
    };

    expect(getQuarterPersonAvailableWeeks(quarter, person, quarterPerson)).toBe(10.8);
  });

  it('returns the full quarter person capacity summary', () => {
    const person: Person = {
      id: 'eng-1',
      name: 'Engineer One',
      email: null,
      role: 'Engineer',
      defaultCapacity: 100,
      subteamId: null,
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const quarterPerson: QuarterPerson = {
      id: 'qp-1',
      quarterId: 'quarter-1',
      personId: 'eng-1',
      subteamId: null,
      inactive: false,
      quarterCapacity: 80,
      overheadOverride: {
        items: [
          { id: 'pto', label: 'PTO', type: 'weeks', value: 0.5 },
          { id: 'meetings', label: 'Meetings', type: 'pct', value: 5 },
        ],
      },
    };

    expect(getQuarterPersonCapacitySummary(quarter, person, quarterPerson)).toEqual({
      baseCapacity: 80,
      effectiveCapacity: 73,
      availableWeeks: 9.5,
      usesOverride: true,
      overhead: quarterPerson.overheadOverride,
    });
  });

  it('summarizes total quarter capacity for engineers only', () => {
    const people: Person[] = [
      {
        id: 'eng-1',
        name: 'Engineer One',
        email: null,
        role: 'Engineer',
        defaultCapacity: 100,
        subteamId: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'pm-1',
        name: 'PM One',
        email: null,
        role: 'PM',
        defaultCapacity: 100,
        subteamId: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const quarterPeople: QuarterPerson[] = [
      {
        id: 'qp-1',
        quarterId: 'quarter-1',
        personId: 'eng-1',
        subteamId: null,
        inactive: false,
        quarterCapacity: 100,
        overheadOverride: null,
      },
      {
        id: 'qp-2',
        quarterId: 'quarter-1',
        personId: 'pm-1',
        subteamId: null,
        inactive: false,
        quarterCapacity: 100,
        overheadOverride: null,
      },
    ];

    expect(getQuarterCapacitySummary(quarter, people, quarterPeople)).toEqual({
      totalAvailablePersonWeeks: 10.8,
      totalAvailableWeeklyPeople: 0.83,
    });
  });

  it('summarizes project reserved and remaining person-weeks', () => {
    const people: Person[] = [
      {
        id: 'eng-1',
        name: 'Engineer One',
        email: null,
        role: 'Engineer',
        defaultCapacity: 100,
        subteamId: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'pm-1',
        name: 'PM One',
        email: null,
        role: 'PM',
        defaultCapacity: 100,
        subteamId: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const quarterPeople: QuarterPerson[] = [
      {
        id: 'qp-1',
        quarterId: 'quarter-1',
        personId: 'eng-1',
        subteamId: null,
        inactive: false,
        quarterCapacity: 100,
        overheadOverride: null,
      },
    ];
    const roles: ProjectRole[] = [
      { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      { id: 'role-2', quarterId: 'quarter-1', projectId: 'project-1', personId: 'pm-1', role: 'PM' },
      { id: 'role-3', quarterId: 'quarter-1', projectId: 'project-2', personId: 'eng-1', role: 'Engineer' },
    ];
    const allocations: Allocation[] = [];

    expect(getProjectCapacitySummary({
      projectId: 'project-1',
      quarter,
      estimatedPersonWeeks: 8,
      people,
      quarterPeople,
      activeProjectRoles: roles,
      activeAllocations: allocations,
    })).toEqual({
      estimatedPersonWeeks: 8,
      reservedPersonWeeks: 5.4,
      reservedWeeklyPeople: 0.42,
      remainingPersonWeeks: 2.6,
    });
  });
});

describe('getAssignableEngineers', () => {
  const baseQuarter: Quarter = {
    id: 'q1',
    name: '2026-Q3',
    startDate: '2026-06-29',
    endDate: '2026-09-27',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdFromQuarterId: null,
    capacityLineAfter: null,
    overhead: { items: [] },
  };

  const makePerson = (id: string, role: string, defaultCapacity = 100): Person => ({
    id,
    name: id,
    email: null,
    role,
    defaultCapacity,
    subteamId: null,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  const makeQP = (personId: string, overrides: Partial<QuarterPerson> = {}): QuarterPerson => ({
    id: `qp-${personId}`,
    quarterId: 'q1',
    personId,
    subteamId: null,
    inactive: false,
    quarterCapacity: 100,
    overheadOverride: null,
    ...overrides,
  });

  const noRoles: ProjectRole[] = [];
  const noAllocs: Allocation[] = [];

  it('includes engineers with a quarter record and available capacity', () => {
    const people = [makePerson('eng-1', 'Engineer')];
    const quarterPeople = [makeQP('eng-1')];
    const result = getAssignableEngineers(people, quarterPeople, baseQuarter, noRoles, noAllocs);
    expect(result.map((p) => p.id)).toEqual(['eng-1']);
  });

  it('excludes engineers with no QuarterPerson record', () => {
    const people = [makePerson('eng-1', 'Engineer')];
    const result = getAssignableEngineers(people, [], baseQuarter, noRoles, noAllocs);
    expect(result).toHaveLength(0);
  });

  it('excludes inactive engineers', () => {
    const people = [makePerson('eng-1', 'Engineer')];
    const quarterPeople = [makeQP('eng-1', { inactive: true })];
    const result = getAssignableEngineers(people, quarterPeople, baseQuarter, noRoles, noAllocs);
    expect(result).toHaveLength(0);
  });

  it('excludes engineers with 0 quarterCapacity', () => {
    const people = [makePerson('eng-1', 'Engineer')];
    const quarterPeople = [makeQP('eng-1', { quarterCapacity: 0 })];
    const result = getAssignableEngineers(people, quarterPeople, baseQuarter, noRoles, noAllocs);
    expect(result).toHaveLength(0);
  });

  it('excludes engineers whose overhead reduces available weeks to 0', () => {
    const people = [makePerson('eng-1', 'Engineer')];
    const quarterPeople = [makeQP('eng-1', {
      overheadOverride: { items: [{ id: 'all', label: 'All', type: 'pct', value: 100 }] },
    })];
    const result = getAssignableEngineers(people, quarterPeople, baseQuarter, noRoles, noAllocs);
    expect(result).toHaveLength(0);
  });

  it('excludes non-engineers (EM, PM)', () => {
    const people = [makePerson('em-1', 'EM'), makePerson('pm-1', 'PM')];
    const quarterPeople = [makeQP('em-1'), makeQP('pm-1')];
    const result = getAssignableEngineers(people, quarterPeople, baseQuarter, noRoles, noAllocs);
    expect(result).toHaveLength(0);
  });

  it('excludes engineers who are DRI on two projects (fully allocated)', () => {
    const people = [makePerson('eng-1', 'Engineer')];
    const quarterPeople = [makeQP('eng-1')];
    const roles: ProjectRole[] = [
      { id: 'r1', quarterId: 'q1', projectId: 'p1', personId: 'eng-1', role: 'DRI' },
      { id: 'r2', quarterId: 'q1', projectId: 'p2', personId: 'eng-1', role: 'DRI' },
    ];
    // DRI minimum is 50% per project, two DRI roles = 100% allocated
    const result = getAssignableEngineers(people, quarterPeople, baseQuarter, roles, noAllocs);
    expect(result).toHaveLength(0);
  });

  it('includes engineers who are DRI on one project but have explicit partial allocation', () => {
    const people = [makePerson('eng-1', 'Engineer')];
    const quarterPeople = [makeQP('eng-1')];
    const roles: ProjectRole[] = [
      { id: 'r1', quarterId: 'q1', projectId: 'p1', personId: 'eng-1', role: 'DRI' },
    ];
    // Explicit 50% allocation leaves 50% free
    const allocs: Allocation[] = [
      { id: 'a1', quarterId: 'q1', personId: 'eng-1', projectId: 'p1', weekStart: '2026-06-29', percentage: 50 },
    ];
    const result = getAssignableEngineers(people, quarterPeople, baseQuarter, roles, allocs);
    expect(result.map((p) => p.id)).toEqual(['eng-1']);
  });

  it('handles mixed people correctly', () => {
    const people = [
      makePerson('eng-1', 'Engineer'),       // valid
      makePerson('eng-2', 'Engineer'),       // no QP record
      makePerson('eng-3', 'Engineer'),       // inactive
      makePerson('pm-1', 'PM'),              // not an engineer
    ];
    const quarterPeople = [
      makeQP('eng-1'),
      makeQP('eng-3', { inactive: true }),
    ];
    const result = getAssignableEngineers(people, quarterPeople, baseQuarter, noRoles, noAllocs);
    expect(result.map((p) => p.id)).toEqual(['eng-1']);
  });
});
