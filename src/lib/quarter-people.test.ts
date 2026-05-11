import { describe, expect, it } from 'vitest';
import { getQuarterPeopleLists, getQuarterPersonProjectSummary } from './quarter-people';
import type { Allocation, Person, ProjectRole, Quarter, QuarterPerson } from './types';

const quarter: Quarter = {
  id: 'q1',
  name: '2026-Q1',
  startDate: '2026-01-05',
  endDate: '2026-03-30',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdFromQuarterId: null,
  capacityLineAfter: null,
  overhead: { items: [] },
};

describe('quarter people helpers', () => {
  it('splits quarter members from addable engineers and filters search', () => {
    const people: Person[] = [
      { id: 'p1', name: 'Alex', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
      { id: 'p2', name: 'Bri', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
      { id: 'p3', name: 'Casey', email: null, role: 'PM', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
    ];
    const quarterPeople: QuarterPerson[] = [
      { id: 'qp1', quarterId: 'q1', personId: 'p1', subteamId: null, inactive: false, quarterCapacity: 100, overheadOverride: null },
      { id: 'qp2', quarterId: 'q1', personId: 'p3', subteamId: null, inactive: false, quarterCapacity: 100, overheadOverride: null },
    ];

    const lists = getQuarterPeopleLists(people, quarterPeople, 'br');

    expect(lists.inQuarter.map((person) => person.id)).toEqual(['p1', 'p3']);
    expect(lists.sortedInQuarter.map((person) => person.id)).toEqual(['p1']);
    expect(lists.notInQuarter.map((person) => person.id)).toEqual(['p2']);
    expect(lists.filteredNotInQuarter.map((person) => person.id)).toEqual(['p2']);
    expect(lists.quarterPersonByPersonId.get('p1')?.id).toBe('qp1');
  });

  it('computes allocation summary for a capacity-tracking person', () => {
    const person: Person = {
      id: 'p1',
      name: 'Alex',
      email: null,
      role: 'Engineer',
      defaultCapacity: 100,
      subteamId: null,
      notes: '',
      createdAt: '',
    };
    const quarterPerson: QuarterPerson = {
      id: 'qp1',
      quarterId: 'q1',
      personId: 'p1',
      subteamId: null,
      inactive: false,
      quarterCapacity: 100,
      overheadOverride: null,
    };
    const projectRoles: ProjectRole[] = [
      { id: 'r1', quarterId: 'q1', projectId: 'proj-1', personId: 'p1', role: 'Engineer' },
      { id: 'r2', quarterId: 'q1', projectId: 'proj-2', personId: 'p1', role: 'Engineer' },
    ];
    const allocations: Allocation[] = [
      { id: 'a1', quarterId: 'q1', personId: 'p1', projectId: 'proj-1', weekStart: '2026-01-05', percentage: 60 },
      { id: 'a2', quarterId: 'q1', personId: 'p1', projectId: 'proj-2', weekStart: '2026-01-05', percentage: 40 },
    ];

    const summary = getQuarterPersonProjectSummary(quarter, person, quarterPerson, projectRoles, allocations);

    expect(summary.tracksCapacity).toBe(true);
    expect(summary.availableWeeks).toBeGreaterThan(0);
    expect(summary.totalAllocatedPct).toBe(100);
    expect(summary.allocatedWeeks).toBe(summary.availableWeeks);
    expect(summary.remainingWeeks).toBe(0);
    expect(summary.overAllocated).toBe(false);
  });

  it('returns a non-capacity summary for PMs', () => {
    const person: Person = {
      id: 'p2',
      name: 'Bri',
      email: null,
      role: 'PM',
      defaultCapacity: 100,
      subteamId: null,
      notes: '',
      createdAt: '',
    };

    const summary = getQuarterPersonProjectSummary(quarter, person, undefined, [], []);

    expect(summary.tracksCapacity).toBe(false);
    expect(summary.totalAllocatedPct).toBe(0);
    expect(summary.allocatedWeeks).toBe(0);
    expect(summary.overAllocated).toBe(false);
  });
});
