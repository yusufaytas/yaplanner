import { describe, expect, it } from 'vitest';
import { planAddProjectToQuarter, planEnsureProjectInQuarter, projectRoleCreatesActiveQuarterEntry } from './quarter-projects';
import type { Allocation, Person, Project, ProjectRole, Quarter, QuarterPerson, QuarterProject } from './types';

const quarter: Quarter = {
  id: 'quarter-2',
  name: '2026-Q3',
  startDate: '2026-07-01',
  endDate: '2026-09-30',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdFromQuarterId: null,
  capacityLineAfter: null,
  overhead: { items: [] },
};

const previousQuarter: Quarter = {
  id: 'quarter-1',
  name: '2026-Q2',
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  status: 'closed',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdFromQuarterId: null,
  capacityLineAfter: null,
  overhead: { items: [] },
};

const olderQuarter: Quarter = {
  id: 'quarter-0',
  name: '2026-Q1',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  status: 'closed',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdFromQuarterId: null,
  capacityLineAfter: null,
  overhead: { items: [] },
};

const project: Project = {
  id: 'project-1',
  name: 'Platform Infra Hardening',
  description: '',
  status: 'Active',
  tags: [],
  owningSubteamId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  archivedAt: null,
};

const people: Person[] = [
  {
    id: 'eng-1',
    name: 'Engineer One',
    email: null,
    role: 'Engineer',
    defaultCapacity: 100,
    subteamId: 'subteam-1',
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

const existingQuarterProjects: QuarterProject[] = [{
  id: 'qp-1',
  quarterId: 'quarter-2',
  projectId: 'project-existing',
  status: 'Active',
  priority: 0,
  estimatedPersonWeeks: null,
  notes: '',
  plannedStartWeek: null,
  plannedEndWeek: null,
  targetMilestone: null,
}];

function makeQuarterPerson(personId: string): QuarterPerson {
  return {
    id: `quarter-person-${personId}`,
    quarterId: quarter.id,
    personId,
    subteamId: null,
    inactive: false,
    quarterCapacity: 100,
    overheadOverride: null,
  };
}

describe('planAddProjectToQuarter', () => {
  it('marks DRI, EM, and PM as roles that create an active quarter entry', () => {
    expect(projectRoleCreatesActiveQuarterEntry('DRI')).toBe(true);
    expect(projectRoleCreatesActiveQuarterEntry('EM')).toBe(true);
    expect(projectRoleCreatesActiveQuarterEntry('PM')).toBe(true);
    expect(projectRoleCreatesActiveQuarterEntry('Engineer')).toBe(false);
  });

  it('creates a missing quarter project for leadership roles only', () => {
    expect(planEnsureProjectInQuarter(quarter, [], project, 'DRI', () => 'generated-id')).toMatchObject({
      id: 'generated-id',
      quarterId: quarter.id,
      projectId: project.id,
      status: project.status,
      priority: 0,
    });
    expect(planEnsureProjectInQuarter(quarter, existingQuarterProjects, project, 'EM', () => 'generated-id')).toMatchObject({
      priority: 1,
    });
    expect(planEnsureProjectInQuarter(quarter, [], project, 'Engineer', () => 'generated-id')).toBeNull();
    expect(planEnsureProjectInQuarter(null, [], project, 'PM', () => 'generated-id')).toBeNull();
  });

  it('does not create a duplicate quarter project if the project is already in the active quarter', () => {
    const currentQuarterProjects: QuarterProject[] = [
      ...existingQuarterProjects,
      {
        id: 'qp-project-1',
        quarterId: quarter.id,
        projectId: project.id,
        status: project.status,
        priority: 1,
        estimatedPersonWeeks: null,
        notes: '',
        plannedStartWeek: null,
        plannedEndWeek: null,
        targetMilestone: null,
      },
    ];

    expect(planEnsureProjectInQuarter(quarter, currentQuarterProjects, project, 'DRI', () => 'generated-id')).toBeNull();
  });

  it('uses template roles and materializes template allocations', () => {
    const roles: ProjectRole[] = [
      { id: 'role-template-dri', quarterId: '', projectId: project.id, personId: 'eng-1', role: 'DRI' },
      { id: 'role-template-pm', quarterId: '', projectId: project.id, personId: 'pm-1', role: 'PM' },
    ];
    const allocations: Allocation[] = [
      { id: 'allocation-template', quarterId: '', personId: 'eng-1', projectId: project.id, weekStart: '', percentage: 60 },
    ];

    let nextId = 1;
    const plan = planAddProjectToQuarter({
      quarter,
      quarterProjects: existingQuarterProjects,
      quarterPeople: [],
      projects: [project],
      people,
      allProjectRoles: roles,
      allAllocations: allocations,
      allQuarters: [quarter, previousQuarter, olderQuarter],
    }, project.id, () => `generated-${nextId++}`);

    expect(plan).not.toBeNull();
    expect(plan?.quarterProjectToCreate).toMatchObject({
      quarterId: quarter.id,
      projectId: project.id,
      priority: 1,
      status: 'Active',
    });
    expect(plan?.quarterRolesToCreate).toHaveLength(2);
    expect(plan?.quarterRolesToCreate.map((role) => role.quarterId)).toEqual([quarter.id, quarter.id]);
    expect(plan?.quarterPeopleToCreate).toEqual([{
      id: 'generated-3',
      quarterId: quarter.id,
      personId: 'eng-1',
      subteamId: 'subteam-1',
      inactive: false,
      quarterCapacity: 100,
      overheadOverride: null,
    }]);
    expect(plan?.allocationPlans).toHaveLength(1);
    expect(plan?.allocationPlans[0]?.percentage).toBe(60);
    expect(plan?.allocationPlans[0]?.allocationsToUpsert).toHaveLength(14);
  });

  it('does not create duplicate quarter people for existing members', () => {
    const roles: ProjectRole[] = [
      { id: 'role-template-dri', quarterId: '', projectId: project.id, personId: 'eng-1', role: 'DRI' },
    ];

    const plan = planAddProjectToQuarter({
      quarter,
      quarterProjects: existingQuarterProjects,
      quarterPeople: [makeQuarterPerson('eng-1')],
      projects: [project],
      people,
      allProjectRoles: roles,
      allAllocations: [],
      allQuarters: [quarter, previousQuarter],
    }, project.id, () => 'generated-id');

    expect(plan?.quarterPeopleToCreate).toEqual([]);
  });

  it('falls back to the latest previous quarter non-engineer roles when no templates exist', () => {
    const roles: ProjectRole[] = [
      { id: 'role-old-em', quarterId: olderQuarter.id, projectId: project.id, personId: 'pm-1', role: 'PM' },
      { id: 'role-prev-pm', quarterId: previousQuarter.id, projectId: project.id, personId: 'pm-1', role: 'PM' },
      { id: 'role-prev-eng', quarterId: previousQuarter.id, projectId: project.id, personId: 'eng-1', role: 'Engineer' },
    ];

    let nextId = 1;
    const plan = planAddProjectToQuarter({
      quarter,
      quarterProjects: [],
      quarterPeople: [],
      projects: [project],
      people,
      allProjectRoles: roles,
      allAllocations: [],
      allQuarters: [quarter, previousQuarter, olderQuarter],
    }, project.id, () => `generated-${nextId++}`);

    expect(plan?.quarterRolesToCreate).toEqual([{
      id: 'generated-1',
      quarterId: quarter.id,
      projectId: project.id,
      personId: 'pm-1',
      role: 'PM',
    }]);
    expect(plan?.quarterPeopleToCreate).toEqual([]);
    expect(plan?.allocationPlans).toEqual([]);
  });

  it('returns null when the project is missing', () => {
    const plan = planAddProjectToQuarter({
      quarter,
      quarterProjects: [],
      quarterPeople: [],
      projects: [],
      people,
      allProjectRoles: [],
      allAllocations: [],
      allQuarters: [quarter],
    }, 'missing-project', () => 'generated-id');

    expect(plan).toBeNull();
  });
});
