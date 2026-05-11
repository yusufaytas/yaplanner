import { describe, expect, it } from 'vitest';
import {
  getDefaultProjectRoleType,
  getAssignablePeopleForProjectRole,
  getEditableProjectRoleOptions,
  getProjectCapacityMinimum,
  getPersonProjectCapacityShare,
  getPersonProjectCapacityShares,
  getProjectRoleOptions,
  getProjectReservedCapacity,
  materializeTemplateAllocationsForQuarter,
  personMatchesProjectRole,
  personNeedsProjectCapacity,
  projectRoleNeedsCapacity,
  planProjectAllocationTemplate,
  planQuarterProjectAllocation,
  planAddProjectRole,
  planProjectRolePersonChange,
  planProjectRoleTypeChange,
  type ProjectTeamContext,
} from './project-team';
import type { Allocation, Person, Project, ProjectRole, Quarter, QuarterPerson, Subteam } from './types';

function buildContext(overrides: Partial<ProjectTeamContext> = {}): ProjectTeamContext {
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
      subteamId: null,
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'eng-2',
      name: 'Engineer Two',
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
      id: 'qp-eng-1',
      quarterId: 'quarter-1',
      personId: 'eng-1',
      subteamId: null,
      inactive: false,
      quarterCapacity: 100,
      overheadOverride: null,
    },
    {
      id: 'qp-eng-2',
      quarterId: 'quarter-1',
      personId: 'eng-2',
      subteamId: null,
      inactive: false,
      quarterCapacity: 100,
      overheadOverride: null,
    },
  ];

  return {
    activeQuarterId: 'quarter-1',
    people,
    project,
    projectRoles: [],
    quarterPeople,
    subteams: [],
    ...overrides,
  };
}

const deps = {
  createId: () => 'generated-id',
  nowIso: () => '2026-02-01T00:00:00.000Z',
};

const activeQuarter: Quarter = {
  id: 'quarter-1',
  name: '2026-Q2',
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdFromQuarterId: null,
  capacityLineAfter: null,
  overhead: { items: [] },
};

describe('project team rules', () => {
  it('hides Engineer until a DRI exists', () => {
    expect(getProjectRoleOptions([])).toEqual(['DRI', 'EM', 'PM']);
  });

  it('shows Engineer and hides DRI once a DRI exists', () => {
    const roles: ProjectRole[] = [
      { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
    ];

    expect(getProjectRoleOptions(roles)).toEqual(['Engineer', 'EM', 'PM']);
    expect(getDefaultProjectRoleType(roles)).toBe('Engineer');
  });

  it('defaults to DRI when the project has no DRI', () => {
    expect(getDefaultProjectRoleType([])).toBe('DRI');
  });

  it('matches people to project roles by discipline', () => {
    expect(personMatchesProjectRole('PM', 'PM')).toBe(true);
    expect(personMatchesProjectRole('PM', 'Engineer')).toBe(false);
    expect(personMatchesProjectRole('EM', 'EM')).toBe(true);
    expect(personMatchesProjectRole('DRI', 'Engineer')).toBe(true);
    expect(personMatchesProjectRole('Engineer', 'Engineer')).toBe(true);
  });

  it('only tracks capacity for engineers', () => {
    expect(personNeedsProjectCapacity('Engineer')).toBe(true);
    expect(personNeedsProjectCapacity('EM')).toBe(false);
    expect(personNeedsProjectCapacity('PM')).toBe(false);
    expect(projectRoleNeedsCapacity('DRI')).toBe(true);
    expect(projectRoleNeedsCapacity('Engineer')).toBe(true);
    expect(projectRoleNeedsCapacity('PM')).toBe(false);
  });

  it('returns editable role options while preserving the current role', () => {
    const roles: ProjectRole[] = [
      { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
    ];

    expect(getEditableProjectRoleOptions(roles, 'DRI')).toEqual(['DRI', 'Engineer', 'EM', 'PM']);
    expect(getEditableProjectRoleOptions(roles, 'EM')).toEqual(['Engineer', 'EM', 'PM']);
  });

  it('filters assignable people by role and existing project assignment', () => {
    const context = buildContext({
      projectRoles: [
        { id: 'role-dri', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      ],
    });

    expect(getAssignablePeopleForProjectRole(context.people, context.projectRoles, 'Engineer').map((person) => person.id))
      .toEqual(['eng-2']);
    expect(getAssignablePeopleForProjectRole(context.people, context.projectRoles, 'PM').map((person) => person.id))
      .toEqual(['pm-1']);
    expect(getAssignablePeopleForProjectRole(context.people, context.projectRoles, 'DRI', 'eng-1').map((person) => person.id))
      .toEqual(['eng-1', 'eng-2']);
  });

  it('defaults a person without explicit allocations to an equal split', () => {
    expect(getPersonProjectCapacityShares('eng-1', 100, ['project-1', 'project-2'], [], [])).toEqual([
      { projectId: 'project-1', percentage: 50, isEvenSplit: true },
      { projectId: 'project-2', percentage: 50, isEvenSplit: true },
    ]);
  });

  it('gives a DRI project 50 percent before splitting the remainder', () => {
    const roles: ProjectRole[] = [
      { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      { id: 'role-2', quarterId: 'quarter-1', projectId: 'project-2', personId: 'eng-1', role: 'Engineer' },
      { id: 'role-3', quarterId: 'quarter-1', projectId: 'project-3', personId: 'eng-1', role: 'Engineer' },
    ];

    expect(getProjectCapacityMinimum('eng-1', 'project-1', roles)).toBe(50);
    expect(getPersonProjectCapacityShares('eng-1', 100, ['project-1', 'project-2', 'project-3'], roles, [])).toEqual([
      { projectId: 'project-1', percentage: 50, isEvenSplit: true },
      { projectId: 'project-2', percentage: 25, isEvenSplit: true },
      { projectId: 'project-3', percentage: 25, isEvenSplit: true },
    ]);
  });

  it('uses explicit allocation and splits the remainder across unallocated projects', () => {
    const allocations: Allocation[] = [
      {
        id: 'alloc-1',
        quarterId: 'quarter-1',
        personId: 'eng-1',
        projectId: 'project-1',
        weekStart: '2026-03-30',
        percentage: 20,
      },
      {
        id: 'alloc-2',
        quarterId: 'quarter-1',
        personId: 'eng-1',
        projectId: 'project-1',
        weekStart: '2026-04-06',
        percentage: 20,
      },
    ];

    expect(getPersonProjectCapacityShares('eng-1', 100, ['project-1', 'project-2'], [], allocations)).toEqual([
      { projectId: 'project-1', percentage: 20, isEvenSplit: false },
      { projectId: 'project-2', percentage: 80, isEvenSplit: true },
    ]);
  });

  it('sums reserved project capacity from assigned people', () => {
    const projectRoles: ProjectRole[] = [
      { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      { id: 'role-2', quarterId: 'quarter-1', projectId: 'project-1', personId: 'pm-1', role: 'PM' },
      { id: 'role-3', quarterId: 'quarter-1', projectId: 'project-2', personId: 'eng-1', role: 'Engineer' },
      { id: 'role-4', quarterId: 'quarter-1', projectId: 'project-3', personId: 'pm-1', role: 'PM' },
    ];
    const allocations: Allocation[] = [
      {
        id: 'alloc-1',
        quarterId: 'quarter-1',
        personId: 'eng-1',
        projectId: 'project-1',
        weekStart: '2026-03-30',
        percentage: 20,
      },
    ];
    const context = buildContext({ projectRoles });

    expect(getProjectReservedCapacity('project-1', context.people, projectRoles, allocations)).toBe(50);
    expect(getPersonProjectCapacityShare(context.people[0], 'project-1', projectRoles, allocations))
      .toEqual({ projectId: 'project-1', percentage: 50, isEvenSplit: false });
    expect(getPersonProjectCapacityShare(context.people[2], 'project-1', projectRoles, allocations))
      .toEqual({ projectId: 'project-1', percentage: 0, isEvenSplit: false });
  });

  it('creates a subteam the moment a DRI is added', () => {
    const plan = planAddProjectRole(buildContext(), 'DRI', 'eng-1', deps);
    expect(plan).not.toBe('duplicate_dri');
    expect(plan).not.toBe('engineer_requires_dri');
    if (typeof plan === 'string') throw new Error(plan);

    expect(plan.subteamToCreate).toMatchObject({
      id: 'generated-id',
      name: 'plat_inf_h',
      driPersonId: 'eng-1',
    });
    expect(plan.projectPatch).toEqual({ owningSubteamId: 'generated-id' });
    expect(plan.peopleUpdates).toEqual([{ personId: 'eng-1', subteamId: 'generated-id' }]);
    expect(plan.quarterPeopleToCreate).toEqual([]);
    expect(plan.quarterPeopleUpdates).toEqual([{ quarterPersonId: 'qp-eng-1', subteamId: 'generated-id' }]);
  });

  it('blocks adding a second DRI', () => {
    const context = buildContext({
      projectRoles: [
        { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      ],
    });

    expect(planAddProjectRole(context, 'DRI', 'eng-2', deps)).toBe('duplicate_dri');
  });

  it('blocks adding Engineer before DRI exists', () => {
    expect(planAddProjectRole(buildContext(), 'Engineer', 'eng-1', deps)).toBe('engineer_requires_dri');
  });

  it('blocks adding the same person to the same project twice', () => {
    const context = buildContext({
      projectRoles: [
        { id: 'role-dri', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      ],
    });

    expect(planAddProjectRole(context, 'EM', 'eng-1', deps)).toBe('duplicate_person');
  });

  it('attaches Engineers to the existing project subteam', () => {
    const subteam: Subteam = {
      id: 'subteam-1',
      name: 'plat_inf_h',
      purpose: null,
      driPersonId: 'eng-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const context = buildContext({
      project: { ...buildContext().project, owningSubteamId: 'subteam-1' },
      projectRoles: [
        { id: 'role-dri', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      ],
      subteams: [subteam],
    });

    const plan = planAddProjectRole(context, 'Engineer', 'eng-2', deps);
    if (typeof plan === 'string') throw new Error(plan);

    expect(plan.subteamToCreate).toBeUndefined();
    expect(plan.peopleUpdates).toEqual([{ personId: 'eng-2', subteamId: 'subteam-1' }]);
    expect(plan.quarterPeopleToCreate).toEqual([]);
    expect(plan.quarterPeopleUpdates).toEqual([{ quarterPersonId: 'qp-eng-2', subteamId: 'subteam-1' }]);
  });

  it('creates a quarter membership when assigning an engineer not yet in the quarter', () => {
    const context = buildContext({
      quarterPeople: [],
      project: { ...buildContext().project, owningSubteamId: 'subteam-1' },
      projectRoles: [
        { id: 'role-dri', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      ],
    });

    const plan = planAddProjectRole(context, 'Engineer', 'eng-2', deps);
    if (typeof plan === 'string') throw new Error(plan);

    expect(plan.peopleUpdates).toEqual([{ personId: 'eng-2', subteamId: 'subteam-1' }]);
    expect(plan.quarterPeopleToCreate).toEqual([{
      id: 'generated-id',
      quarterId: 'quarter-1',
      personId: 'eng-2',
      subteamId: 'subteam-1',
      inactive: false,
      quarterCapacity: 100,
      overheadOverride: null,
    }]);
    expect(plan.quarterPeopleUpdates).toEqual([]);
  });

  it('converting an existing role to DRI creates the project subteam', () => {
    const context = buildContext({
      projectRoles: [
        { id: 'role-pm', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'PM' },
      ],
    });

    const plan = planProjectRoleTypeChange(context, 'role-pm', 'DRI', deps);
    if (typeof plan === 'string') throw new Error(plan);

    expect(plan.roleUpdate).toEqual({ roleId: 'role-pm', patch: { role: 'DRI' } });
    expect(plan.subteamToCreate?.driPersonId).toBe('eng-1');
    expect(plan.projectPatch).toEqual({ owningSubteamId: 'generated-id' });
  });

  it('changing the DRI person updates the project subteam lead', () => {
    const subteam: Subteam = {
      id: 'subteam-1',
      name: 'plat_inf_h',
      purpose: null,
      driPersonId: 'eng-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const context = buildContext({
      project: { ...buildContext().project, owningSubteamId: 'subteam-1' },
      projectRoles: [
        { id: 'role-dri', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      ],
      subteams: [subteam],
    });

    const plan = planProjectRolePersonChange(context, 'role-dri', 'eng-2', deps);
    if (typeof plan === 'string') throw new Error(plan);

    expect(plan.roleUpdate).toEqual({ roleId: 'role-dri', patch: { personId: 'eng-2' } });
    expect(plan.subteamToUpdate).toEqual({ id: 'subteam-1', patch: { driPersonId: 'eng-2' } });
    expect(plan.peopleUpdates).toEqual([{ personId: 'eng-2', subteamId: 'subteam-1' }]);
    expect(plan.quarterPeopleToCreate).toEqual([]);
  });

  it('blocks changing a role to a person already assigned on the project', () => {
    const context = buildContext({
      projectRoles: [
        { id: 'role-dri', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
        { id: 'role-pm', quarterId: 'quarter-1', projectId: 'project-1', personId: 'pm-1', role: 'PM' },
      ],
    });

    expect(planProjectRolePersonChange(context, 'role-pm', 'eng-1', deps)).toBe('duplicate_person');
  });

  it('writes one allocation per quarter week when project capacity is set', () => {
    const plan = planQuarterProjectAllocation(activeQuarter, 'eng-1', 'project-1', 20, [], [], deps.createId);

    expect(plan.allocationsToDelete).toEqual([]);
    expect(plan.percentage).toBe(20);
    expect(plan.allocationsToUpsert).toHaveLength(14);
    expect(plan.allocationsToUpsert[0]).toMatchObject({
      id: 'generated-id',
      quarterId: 'quarter-1',
      personId: 'eng-1',
      projectId: 'project-1',
      percentage: 20,
    });
  });

  it('removes explicit allocations when project capacity is cleared', () => {
    const existingAllocations: Allocation[] = [
      {
        id: 'alloc-1',
        quarterId: 'quarter-1',
        personId: 'eng-1',
        projectId: 'project-1',
        weekStart: '2026-03-30',
        percentage: 20,
      },
    ];

    expect(planQuarterProjectAllocation(activeQuarter, 'eng-1', 'project-1', 0, [], existingAllocations, deps.createId))
      .toEqual({
        allocationsToDelete: ['alloc-1'],
        allocationsToUpsert: [],
        percentage: 0,
      });
  });

  it('clamps DRI project allocations to at least 50 percent', () => {
    const roles: ProjectRole[] = [
      { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
    ];

    const plan = planQuarterProjectAllocation(activeQuarter, 'eng-1', 'project-1', 20, roles, [], deps.createId);

    expect(plan.percentage).toBe(50);
    expect(plan.allocationsToUpsert[0]?.percentage).toBe(50);
  });

  it('stores a template allocation when no quarter is active', () => {
    const plan = planProjectAllocationTemplate('eng-1', 'project-1', 20, [], [], deps.createId);

    expect(plan.allocationsToDelete).toEqual([]);
    expect(plan.percentage).toBe(20);
    expect(plan.allocationsToUpsert).toEqual([{
      id: 'generated-id',
      quarterId: '',
      personId: 'eng-1',
      projectId: 'project-1',
      weekStart: '',
      percentage: 20,
    }]);
  });

  it('reuses the existing template allocation and deletes duplicates', () => {
    const existingAllocations: Allocation[] = [
      { id: 'template-1', quarterId: '', personId: 'eng-1', projectId: 'project-1', weekStart: '', percentage: 10 },
      { id: 'template-2', quarterId: '', personId: 'eng-1', projectId: 'project-1', weekStart: 'stale', percentage: 15 },
    ];

    const plan = planProjectAllocationTemplate('eng-1', 'project-1', 30, [], existingAllocations, deps.createId);

    expect(plan.allocationsToDelete).toEqual(['template-2']);
    expect(plan.allocationsToUpsert).toEqual([{
      id: 'template-1',
      quarterId: '',
      personId: 'eng-1',
      projectId: 'project-1',
      weekStart: '',
      percentage: 30,
    }]);
  });

  it('clamps DRI template allocations to at least 50 percent', () => {
    const roles: ProjectRole[] = [
      { id: 'role-1', quarterId: '', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
    ];

    const plan = planProjectAllocationTemplate('eng-1', 'project-1', 20, roles, [], deps.createId);

    expect(plan.percentage).toBe(50);
    expect(plan.allocationsToUpsert[0]?.percentage).toBe(50);
  });

  it('materializes template allocations into quarter weeks', () => {
    const templateRoles: ProjectRole[] = [
      { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'Engineer' },
    ];
    const templateAllocations: Allocation[] = [{
      id: 'template-1',
      quarterId: '',
      personId: 'eng-1',
      projectId: 'project-1',
      weekStart: '',
      percentage: 35,
    }];

    const plans = materializeTemplateAllocationsForQuarter(
      activeQuarter,
      'project-1',
      templateRoles,
      templateAllocations,
      deps.createId,
    );

    expect(plans).toHaveLength(1);
    expect(plans[0]?.percentage).toBe(35);
    expect(plans[0]?.allocationsToUpsert).toHaveLength(14);
    expect(plans[0]?.allocationsToUpsert[0]).toMatchObject({
      quarterId: 'quarter-1',
      personId: 'eng-1',
      projectId: 'project-1',
      percentage: 35,
    });
  });

  it('materializes DRI template allocations and ignores non-capacity roles', () => {
    const templateRoles: ProjectRole[] = [
      { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'DRI' },
      { id: 'role-2', quarterId: 'quarter-1', projectId: 'project-1', personId: 'pm-1', role: 'PM' },
    ];
    const templateAllocations: Allocation[] = [
      { id: 'template-1', quarterId: '', personId: 'eng-1', projectId: 'project-1', weekStart: '', percentage: 60 },
      { id: 'template-2', quarterId: '', personId: 'pm-1', projectId: 'project-1', weekStart: '', percentage: 40 },
    ];

    const plans = materializeTemplateAllocationsForQuarter(
      activeQuarter,
      'project-1',
      templateRoles,
      templateAllocations,
      deps.createId,
    );

    expect(plans).toHaveLength(1);
    expect(plans[0]?.percentage).toBe(60);
    expect(plans[0]?.allocationsToUpsert[0]).toMatchObject({
      personId: 'eng-1',
      projectId: 'project-1',
      percentage: 60,
    });
  });

  it('only materializes template allocations for the selected project', () => {
    const templateRoles: ProjectRole[] = [
      { id: 'role-1', quarterId: 'quarter-1', projectId: 'project-1', personId: 'eng-1', role: 'Engineer' },
    ];
    const templateAllocations: Allocation[] = [
      { id: 'template-1', quarterId: '', personId: 'eng-1', projectId: 'project-2', weekStart: '', percentage: 25 },
    ];

    const plans = materializeTemplateAllocationsForQuarter(
      activeQuarter,
      'project-1',
      templateRoles,
      templateAllocations,
      deps.createId,
    );

    expect(plans).toEqual([]);
  });
});
