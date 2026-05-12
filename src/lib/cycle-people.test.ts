import { describe, expect, it } from 'vitest';
import { getCyclePeopleLists } from './cycle-people';
import type { Person, CyclePerson } from './types';

function makePerson(overrides: Partial<Person> & Pick<Person, 'id' | 'role'>): Person {
  return {
    name: overrides.id,
    email: null,
    defaultCapacity: 100,
    subteamId: null,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCyclePerson(personId: string, cycleId = 'q1'): CyclePerson {
  return {
    id: `qp-${personId}`,
    cycleId,
    personId,
    subteamId: null,
    inactive: false,
    cycleCapacity: 100,
    overheadOverride: null,
  };
}

const engineer1 = makePerson({ id: 'eng-1', name: 'Alice Smith', role: 'Engineer' });
const engineer2 = makePerson({ id: 'eng-2', name: 'Bob Jones', role: 'Engineer' });
const dri1 = makePerson({ id: 'dri-1', name: 'Carol DRI', role: 'DRI' });
const em1 = makePerson({ id: 'em-1', name: 'Dave EM', role: 'EM' });
const pm1 = makePerson({ id: 'pm-1', name: 'Eve PM', role: 'PM' });

describe('getCyclePeopleLists', () => {
  it('separates people into inCycle and notInCycle', () => {
    const people = [engineer1, engineer2];
    const cyclePeople = [makeCyclePerson('eng-1')];
    const result = getCyclePeopleLists(people, cyclePeople, '');
    expect(result.inCycle.map((p) => p.id)).toEqual(['eng-1']);
    expect(result.notInCycle.map((p) => p.id)).toEqual(['eng-2']);
  });

  it('only includes capacity-tracking roles (Engineer, DRI) in notInCycle', () => {
    const people = [engineer1, em1, pm1];
    const cyclePeople = [];
    const result = getCyclePeopleLists(people, cyclePeople, '');
    // EM and PM do not track capacity, so they should not appear in notInCycle
    expect(result.notInCycle.map((p) => p.id)).toEqual(['eng-1']);
  });

  it('includes all roles in inCycle', () => {
    const people = [engineer1, em1, pm1];
    const cyclePeople = [makeCyclePerson('eng-1'), makeCyclePerson('em-1'), makeCyclePerson('pm-1')];
    const result = getCyclePeopleLists(people, cyclePeople, '');
    expect(result.inCycle).toHaveLength(3);
  });

  it('sortedInCycle only contains capacity-tracking people, sorted by name', () => {
    const people = [engineer2, engineer1, dri1, em1];
    const cyclePeople = [
      makeCyclePerson('eng-1'),
      makeCyclePerson('eng-2'),
      makeCyclePerson('dri-1'),
      makeCyclePerson('em-1'),
    ];
    const result = getCyclePeopleLists(people, cyclePeople, '');
    // em1 is not capacity-tracking, so excluded from sortedInCycle
    expect(result.sortedInCycle.map((p) => p.id)).toEqual(['eng-1', 'eng-2', 'dri-1'].sort((a, b) => {
      const nameA = people.find((p) => p.id === a)!.name;
      const nameB = people.find((p) => p.id === b)!.name;
      return nameA.localeCompare(nameB);
    }));
  });

  it('filters notInCycle by search string (case-insensitive)', () => {
    const people = [engineer1, engineer2];
    const cyclePeople = [];
    const result = getCyclePeopleLists(people, cyclePeople, 'alice');
    expect(result.filteredNotInCycle.map((p) => p.id)).toEqual(['eng-1']);
  });

  it('returns all notInCycle when search is empty', () => {
    const people = [engineer1, engineer2];
    const cyclePeople = [];
    const result = getCyclePeopleLists(people, cyclePeople, '');
    expect(result.filteredNotInCycle).toHaveLength(2);
  });

  it('returns empty filteredNotInCycle when search matches nothing', () => {
    const people = [engineer1, engineer2];
    const cyclePeople = [];
    const result = getCyclePeopleLists(people, cyclePeople, 'zzz');
    expect(result.filteredNotInCycle).toHaveLength(0);
  });

  it('trims whitespace from the search string', () => {
    const people = [engineer1, engineer2];
    const cyclePeople = [];
    const result = getCyclePeopleLists(people, cyclePeople, '  alice  ');
    expect(result.filteredNotInCycle.map((p) => p.id)).toEqual(['eng-1']);
  });

  it('builds a cyclePersonByPersonId map keyed by personId', () => {
    const people = [engineer1, engineer2];
    const cyclePeople = [makeCyclePerson('eng-1')];
    const result = getCyclePeopleLists(people, cyclePeople, '');
    expect(result.cyclePersonByPersonId.has('eng-1')).toBe(true);
    expect(result.cyclePersonByPersonId.has('eng-2')).toBe(false);
    expect(result.cyclePersonByPersonId.get('eng-1')?.id).toBe('qp-eng-1');
  });

  it('returns all empty collections for empty inputs', () => {
    const result = getCyclePeopleLists([], [], '');
    expect(result.inCycle).toHaveLength(0);
    expect(result.notInCycle).toHaveLength(0);
    expect(result.sortedInCycle).toHaveLength(0);
    expect(result.filteredNotInCycle).toHaveLength(0);
    expect(result.cyclePersonByPersonId.size).toBe(0);
  });
});
