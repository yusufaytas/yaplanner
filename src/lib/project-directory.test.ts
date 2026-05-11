import { describe, expect, it } from 'vitest';
import { buildProjectLeadershipMaps, splitProjectsByStatus } from './project-directory';
import type { Project, ProjectRole } from './types';

describe('project directory helpers', () => {
  it('builds leadership maps scoped to the active quarter', () => {
    const roles: ProjectRole[] = [
      { id: 'r1', quarterId: 'q1', projectId: 'p1', personId: 'eng-1', role: 'DRI' },
      { id: 'r2', quarterId: 'q1', projectId: 'p1', personId: 'em-1', role: 'EM' },
      { id: 'r3', quarterId: 'q1', projectId: 'p1', personId: 'pm-1', role: 'PM' },
      { id: 'r4', quarterId: 'q2', projectId: 'p1', personId: 'eng-2', role: 'DRI' },
      { id: 'r5', quarterId: 'q1', projectId: 'p2', personId: 'eng-3', role: 'DRI' },
    ];

    const { driByProject, emByProject, pmByProject } = buildProjectLeadershipMaps(roles, 'q1');

    expect(driByProject.get('p1')).toBe('eng-1');
    expect(driByProject.get('p2')).toBe('eng-3');
    expect(emByProject.get('p1')).toBe('em-1');
    expect(pmByProject.get('p1')).toBe('pm-1');
  });

  it('uses all roles when there is no active quarter', () => {
    const roles: ProjectRole[] = [
      { id: 'r1', quarterId: '', projectId: 'p1', personId: 'eng-1', role: 'DRI' },
    ];

    const { driByProject } = buildProjectLeadershipMaps(roles, null);

    expect(driByProject.get('p1')).toBe('eng-1');
  });

  it('splits projects into active and archived sets', () => {
    const projects: Project[] = [
      {
        id: 'p1',
        name: 'Alpha',
        description: '',
        status: 'Proposed',
        tags: [],
        owningSubteamId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      },
      {
        id: 'p2',
        name: 'Beta',
        description: '',
        status: 'Complete',
        tags: [],
        owningSubteamId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      },
      {
        id: 'p3',
        name: 'Gamma',
        description: '',
        status: 'On Hold',
        tags: [],
        owningSubteamId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      },
    ];

    const { activeProjects, archivedProjects } = splitProjectsByStatus(projects);

    expect(activeProjects.map((project) => project.id)).toEqual(['p1', 'p3']);
    expect(archivedProjects.map((project) => project.id)).toEqual(['p2']);
  });
});
