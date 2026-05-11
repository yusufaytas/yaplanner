import { describe, expect, it } from 'vitest';
import { getProjectCardPersonName, resolveCreatedPersonSubteamId, splitLeadershipPeople } from './people-directory';
import type { Person } from './types';

describe('people directory helpers', () => {
  it('splits leadership people into EM and PM groups', () => {
    const people: Person[] = [
      { id: 'p1', name: 'Alex', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
      { id: 'p2', name: 'Bri', email: null, role: 'EM', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
      { id: 'p3', name: 'Casey', email: null, role: 'PM', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
    ];

    const { ems, pms } = splitLeadershipPeople(people);

    expect(ems.map((person) => person.id)).toEqual(['p2']);
    expect(pms.map((person) => person.id)).toEqual(['p3']);
  });

  it('only keeps subteam assignment for engineers when creating a person', () => {
    expect(resolveCreatedPersonSubteamId('Engineer', 'subteam-1')).toBe('subteam-1');
    expect(resolveCreatedPersonSubteamId('Engineer', '')).toBeNull();
    expect(resolveCreatedPersonSubteamId('PM', 'subteam-1')).toBeNull();
  });

  it('uses first names on project cards unless they need disambiguation', () => {
    const alexOne = { id: 'p1', name: 'Alex Smith' };
    const alexTwo = { id: 'p2', name: 'Alex Johnson' };
    const bri = { id: 'p3', name: 'Bri Taylor' };

    expect(getProjectCardPersonName(bri, [alexOne, alexTwo, bri])).toBe('Bri');
    expect(getProjectCardPersonName(alexOne, [alexOne, alexTwo, bri])).toBe('Alex Smith');
    expect(getProjectCardPersonName(alexTwo, [alexOne, alexTwo, bri])).toBe('Alex Johnson');
  });
});
