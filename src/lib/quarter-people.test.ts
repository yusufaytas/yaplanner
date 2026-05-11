import { describe, expect, it } from 'vitest';
import { getQuarterPeopleLists } from './quarter-people';
import type { Person, QuarterPerson } from './types';

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

function makeQuarterPerson(personId: string, quarterId = 'q1'): QuarterPerson {
  return {
    id: `qp-${personId}`,
    quarterId,
    personId,
    subteamId: null,
    inactive: false,
    quarterCapacity: 100,
    overheadOverride: null,
  };
}

const engineer1 = makePerson({ id: 'eng-1', name: 'Alice Smith', role: 'Engineer' });
const engineer2 = makePerson({ id: 'eng-2', name: 'Bob Jones', role: 'Engineer' });
const dri1 = makePerson({ id: 'dri-1', name: 'Carol DRI', role: 'DRI' });
const em1 = makePerson({ id: 'em-1', name: 'Dave EM', role: 'EM' });
const pm1 = makePerson({ id: 'pm-1', name: 'Eve PM', role: 'PM' });

describe('getQuarterPeopleLists', () => {
  it('separates people into inQuarter and notInQuarter', () => {
    const people = [engineer1, engineer2];
    const quarterPeople = [makeQuarterPerson('eng-1')];
    const result = getQuarterPeopleLists(people, quarterPeople, '');
    expect(result.inQuarter.map((p) => p.id)).toEqual(['eng-1']);
    expect(result.notInQuarter.map((p) => p.id)).toEqual(['eng-2']);
  });

  it('only includes capacity-tracking roles (Engineer, DRI) in notInQuarter', () => {
    const people = [engineer1, em1, pm1];
    const quarterPeople = [];
    const result = getQuarterPeopleLists(people, quarterPeople, '');
    // EM and PM do not track capacity, so they should not appear in notInQuarter
    expect(result.notInQuarter.map((p) => p.id)).toEqual(['eng-1']);
  });

  it('includes all roles in inQuarter', () => {
    const people = [engineer1, em1, pm1];
    const quarterPeople = [makeQuarterPerson('eng-1'), makeQuarterPerson('em-1'), makeQuarterPerson('pm-1')];
    const result = getQuarterPeopleLists(people, quarterPeople, '');
    expect(result.inQuarter).toHaveLength(3);
  });

  it('sortedInQuarter only contains capacity-tracking people, sorted by name', () => {
    const people = [engineer2, engineer1, dri1, em1];
    const quarterPeople = [
      makeQuarterPerson('eng-1'),
      makeQuarterPerson('eng-2'),
      makeQuarterPerson('dri-1'),
      makeQuarterPerson('em-1'),
    ];
    const result = getQuarterPeopleLists(people, quarterPeople, '');
    // em1 is not capacity-tracking, so excluded from sortedInQuarter
    expect(result.sortedInQuarter.map((p) => p.id)).toEqual(['eng-1', 'eng-2', 'dri-1'].sort((a, b) => {
      const nameA = people.find((p) => p.id === a)!.name;
      const nameB = people.find((p) => p.id === b)!.name;
      return nameA.localeCompare(nameB);
    }));
  });

  it('filters notInQuarter by search string (case-insensitive)', () => {
    const people = [engineer1, engineer2];
    const quarterPeople = [];
    const result = getQuarterPeopleLists(people, quarterPeople, 'alice');
    expect(result.filteredNotInQuarter.map((p) => p.id)).toEqual(['eng-1']);
  });

  it('returns all notInQuarter when search is empty', () => {
    const people = [engineer1, engineer2];
    const quarterPeople = [];
    const result = getQuarterPeopleLists(people, quarterPeople, '');
    expect(result.filteredNotInQuarter).toHaveLength(2);
  });

  it('returns empty filteredNotInQuarter when search matches nothing', () => {
    const people = [engineer1, engineer2];
    const quarterPeople = [];
    const result = getQuarterPeopleLists(people, quarterPeople, 'zzz');
    expect(result.filteredNotInQuarter).toHaveLength(0);
  });

  it('trims whitespace from the search string', () => {
    const people = [engineer1, engineer2];
    const quarterPeople = [];
    const result = getQuarterPeopleLists(people, quarterPeople, '  alice  ');
    expect(result.filteredNotInQuarter.map((p) => p.id)).toEqual(['eng-1']);
  });

  it('builds a quarterPersonByPersonId map keyed by personId', () => {
    const people = [engineer1, engineer2];
    const quarterPeople = [makeQuarterPerson('eng-1')];
    const result = getQuarterPeopleLists(people, quarterPeople, '');
    expect(result.quarterPersonByPersonId.has('eng-1')).toBe(true);
    expect(result.quarterPersonByPersonId.has('eng-2')).toBe(false);
    expect(result.quarterPersonByPersonId.get('eng-1')?.id).toBe('qp-eng-1');
  });

  it('returns all empty collections for empty inputs', () => {
    const result = getQuarterPeopleLists([], [], '');
    expect(result.inQuarter).toHaveLength(0);
    expect(result.notInQuarter).toHaveLength(0);
    expect(result.sortedInQuarter).toHaveLength(0);
    expect(result.filteredNotInQuarter).toHaveLength(0);
    expect(result.quarterPersonByPersonId.size).toBe(0);
  });
});
