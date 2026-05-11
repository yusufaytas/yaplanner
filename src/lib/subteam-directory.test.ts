import { describe, expect, it } from 'vitest';
import { getSubteamMemberCollections, getSubteamMemberCountBySubteam, getSubteamProjectCollections } from './subteam-directory';
import type { Person, Project, ProjectRole } from './types';

describe('subteam directory helpers', () => {
  it('collects engineer members and non-members for a subteam', () => {
    const people: Person[] = [
      { id: 'p1', name: 'Alex', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: 's1', notes: '', createdAt: '' },
      { id: 'p2', name: 'Bri', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
      { id: 'p3', name: 'Casey', email: null, role: 'PM', defaultCapacity: 100, subteamId: 's1', notes: '', createdAt: '' },
    ];

    const collections = getSubteamMemberCollections(people, 's1');

    expect(collections.engineerMembers.map((person) => person.id)).toEqual(['p1']);
    expect(collections.nonMembers.map((person) => person.id)).toEqual(['p2']);
    expect(collections.memberIds.has('p1')).toBe(true);
    expect(collections.memberIds.has('p3')).toBe(false);
  });

  it('groups owned and contributing projects for the active quarter', () => {
    const projects: Project[] = [
      { id: 'proj-1', name: 'Alpha', description: '', status: 'Active', tags: [], owningSubteamId: 's1', createdAt: '', archivedAt: null },
      { id: 'proj-2', name: 'Beta', description: '', status: 'Active', tags: [], owningSubteamId: null, createdAt: '', archivedAt: null },
      { id: 'proj-3', name: 'Gamma', description: '', status: 'Active', tags: [], owningSubteamId: null, createdAt: '', archivedAt: null },
    ];
    const roles: ProjectRole[] = [
      { id: 'r1', quarterId: 'q1', projectId: 'proj-1', personId: 'p1', role: 'Engineer' },
      { id: 'r2', quarterId: 'q1', projectId: 'proj-2', personId: 'p1', role: 'Engineer' },
      { id: 'r3', quarterId: 'q2', projectId: 'proj-3', personId: 'p1', role: 'Engineer' },
    ];

    const collections = getSubteamProjectCollections(projects, roles, 'q1', new Set(['p1']), 's1');

    expect(collections.ownedProjects.map((project) => project.id)).toEqual(['proj-1']);
    expect(collections.contributingProjects.map((project) => project.id)).toEqual(['proj-2']);
  });

  it('counts only engineer members per subteam', () => {
    const people: Person[] = [
      { id: 'p1', name: 'Alex', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: 's1', notes: '', createdAt: '' },
      { id: 'p2', name: 'Bri', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: 's1', notes: '', createdAt: '' },
      { id: 'p3', name: 'Casey', email: null, role: 'PM', defaultCapacity: 100, subteamId: 's1', notes: '', createdAt: '' },
    ];

    const counts = getSubteamMemberCountBySubteam(people);

    expect(counts.get('s1')).toBe(2);
  });
});
