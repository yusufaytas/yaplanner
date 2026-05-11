import { describe, expect, it } from 'vitest';
import {
  buildProjectQuarterCapacitySummaries,
  getActiveProjectAllocations,
  getActiveProjectRoles,
  getAssignedProjectQuarters,
  getRemainingProjectPersonCapacity,
  sortProjectRoles,
} from './project-detail';
import type { Allocation, Person, ProjectRole, Quarter, QuarterPerson, QuarterProject } from './types';

describe('project detail helpers', () => {
  it('scopes active project roles and allocations to the active quarter', () => {
    const roles: ProjectRole[] = [
      { id: 'r1', quarterId: 'q1', projectId: 'p1', personId: 'person-1', role: 'DRI' },
      { id: 'r2', quarterId: 'q1', projectId: 'p2', personId: 'person-2', role: 'Engineer' },
      { id: 'r3', quarterId: 'q2', projectId: 'p1', personId: 'person-3', role: 'Engineer' },
    ];
    const allocations: Allocation[] = [
      { id: 'a1', quarterId: 'q1', personId: 'person-1', projectId: 'p1', weekStart: '2026-01-05', percentage: 50 },
      { id: 'a2', quarterId: 'q2', personId: 'person-3', projectId: 'p1', weekStart: '2026-04-06', percentage: 75 },
    ];

    const scopedRoles = getActiveProjectRoles('p1', 'q1', roles);
    const scopedAllocations = getActiveProjectAllocations('q1', allocations);

    expect(scopedRoles.activeProjectRoles.map((role) => role.id)).toEqual(['r1', 'r2']);
    expect(scopedRoles.projectRoles.map((role) => role.id)).toEqual(['r1']);
    expect(scopedAllocations.map((allocation) => allocation.id)).toEqual(['a1']);
  });

  it('sorts project roles by delivery precedence', () => {
    const roles: ProjectRole[] = [
      { id: 'r4', quarterId: 'q1', projectId: 'p1', personId: 'person-4', role: 'Engineer' },
      { id: 'r3', quarterId: 'q1', projectId: 'p1', personId: 'person-3', role: 'PM' },
      { id: 'r2', quarterId: 'q1', projectId: 'p1', personId: 'person-2', role: 'EM' },
      { id: 'r1', quarterId: 'q1', projectId: 'p1', personId: 'person-1', role: 'DRI' },
    ];

    expect(sortProjectRoles(roles).map((role) => role.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('builds assigned quarter summaries and remaining capacity', () => {
    const quarters: Quarter[] = [
      {
        id: 'q1',
        name: '2026-Q1',
        startDate: '2026-01-05',
        endDate: '2026-03-30',
        status: 'active',
        createdAt: '',
        createdFromQuarterId: null,
        capacityLineAfter: null,
        overhead: { items: [] },
      },
    ];
    const quarterProjects: QuarterProject[] = [
      {
        id: 'qp1',
        quarterId: 'q1',
        projectId: 'p1',
        status: 'Active',
        priority: 0,
        estimatedPersonWeeks: 10,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
    ];
    const people: Person[] = [
      { id: 'person-1', name: 'Alex', email: null, role: 'Engineer', defaultCapacity: 100, subteamId: null, notes: '', createdAt: '' },
    ];
    const quarterPeople: QuarterPerson[] = [
      { id: 'qp-person-1', quarterId: 'q1', personId: 'person-1', subteamId: null, inactive: false, quarterCapacity: 100, overheadOverride: null },
    ];
    const roles: ProjectRole[] = [
      { id: 'r1', quarterId: 'q1', projectId: 'p1', personId: 'person-1', role: 'Engineer' },
    ];
    const allocations: Allocation[] = [
      { id: 'a1', quarterId: 'q1', personId: 'person-1', projectId: 'p1', weekStart: '2026-01-05', percentage: 60 },
    ];

    const assignedQuarters = getAssignedProjectQuarters(quarters, quarterProjects);
    const summaries = buildProjectQuarterCapacitySummaries({
      projectId: 'p1',
      assignedQuarters,
      allQuarterProjects: quarterProjects,
      allProjectRoles: roles,
      allocations,
      people,
      quarterPeople,
    });

    expect(assignedQuarters.map((quarter) => quarter.id)).toEqual(['q1']);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].summary.estimatedPersonWeeks).toBe(10);
    expect(summaries[0].summary.reservedPersonWeeks).toBeGreaterThan(0);
    expect(getRemainingProjectPersonCapacity('person-1', people, roles, allocations)).toBe(40);
  });
});
