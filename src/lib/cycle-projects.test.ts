import { describe, expect, it } from 'vitest';
import { planAddProjectToCycle } from './cycle-projects';
import type { Allocation, Person, Project, Cycle, CyclePerson, CycleProject } from './types';

const quarter: Cycle = {
  id: 'q1',
  name: '2026-Q2',
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  status: 'active',
  createdAt: '2026-03-01T00:00:00.000Z',
  createdFromCycleId: null,
  capacityLineAfter: null,
  overhead: { items: [] },
};

function makeProject(overrides: Partial<Project> & Pick<Project, 'id'>): Project {
  return {
    name: overrides.id,
    description: '',
    status: 'Active',
    tags: [],
    subteamId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    links: [],
    unknowns: [],
    risks: [],
    ...overrides,
  };
}

function makePerson(overrides: Partial<Person> & Pick<Person, 'id'>): Person {
  return {
    name: overrides.id,
    email: null,
    role: 'Engineer',
    defaultCapacity: 100,
    subteamId: null,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAllocation(
  overrides: Partial<Allocation> & Pick<Allocation, 'id' | 'personId' | 'projectId' | 'role'>,
): Allocation {
  return {
    cycleId: '',
    startDate: null,
    endDate: null,
    percentage: 0,
    ...overrides,
  };
}

let idCounter = 0;
function nextId() {
  return `gen-${++idCounter}`;
}

describe('planAddProjectToCycle', () => {
  it('returns null when the project does not exist', () => {
    const result = planAddProjectToCycle(
      {
        quarter,
        cycleProjects: [],
        cyclePeople: [],
        projects: [],
        people: [],
        allAllocations: [],
      },
      'nonexistent',
      nextId,
    );
    expect(result).toBeNull();
  });

  it('creates a CycleProject record with the correct cycleId and projectId', () => {
    const project = makeProject({ id: 'p1' });
    const result = planAddProjectToCycle(
      {
        quarter,
        cycleProjects: [],
        cyclePeople: [],
        projects: [project],
        people: [],
        allAllocations: [],
      },
      'p1',
      nextId,
    );
    expect(result).not.toBeNull();
    expect(result!.cycleProjectToCreate.cycleId).toBe('q1');
    expect(result!.cycleProjectToCreate.projectId).toBe('p1');
  });

  it('sets priority to the current number of quarter projects', () => {
    const project = makeProject({ id: 'p1' });
    const existingQP: CycleProject = {
      id: 'qp-existing',
      cycleId: 'q1',
      projectId: 'p-other',
      status: 'Active',
      priority: 0,
      estimatedPersonWeeks: null,
      notes: '',
      plannedStartWeek: null,
      plannedEndWeek: null,
      targetMilestone: null,
    };
    const result = planAddProjectToCycle(
      {
        quarter,
        cycleProjects: [existingQP],
        cyclePeople: [],
        projects: [project],
        people: [],
        allAllocations: [],
      },
      'p1',
      nextId,
    );
    expect(result!.cycleProjectToCreate.priority).toBe(1);
  });

  it('uses template allocations (cycleId="") when they exist', () => {
    const project = makeProject({ id: 'p1', subteamId: 'st1' });
    const person = makePerson({ id: 'eng-1' });
    const templateAllocation = makeAllocation({
      id: 'tmpl-1',
      personId: 'eng-1',
      projectId: 'p1',
      role: 'Engineer',
      cycleId: '',
    });
    const result = planAddProjectToCycle(
      {
        quarter,
        cycleProjects: [],
        cyclePeople: [],
        projects: [project],
        people: [person],
        allAllocations: [templateAllocation],
      },
      'p1',
      nextId,
    );
    expect(result).not.toBeNull();
    expect(result!.allocationsToCreate).toHaveLength(1);
    expect(result!.allocationsToCreate[0].personId).toBe('eng-1');
    expect(result!.allocationsToCreate[0].cycleId).toBe('q1');
    expect(result!.allocationsToCreate[0].startDate).toBe(quarter.startDate);
    expect(result!.allocationsToCreate[0].endDate).toBeNull();
  });

  it('creates a CyclePerson entry for people not yet in the quarter', () => {
    const project = makeProject({ id: 'p1' });
    const person = makePerson({ id: 'eng-1', defaultCapacity: 80 });
    const templateAllocation = makeAllocation({
      id: 'tmpl-1',
      personId: 'eng-1',
      projectId: 'p1',
      role: 'Engineer',
      cycleId: '',
    });
    const result = planAddProjectToCycle(
      {
        quarter,
        cycleProjects: [],
        cyclePeople: [],
        projects: [project],
        people: [person],
        allAllocations: [templateAllocation],
      },
      'p1',
      nextId,
    );
    expect(result!.cyclePeopleToCreate).toHaveLength(1);
    expect(result!.cyclePeopleToCreate[0].personId).toBe('eng-1');
    expect(result!.cyclePeopleToCreate[0].cycleId).toBe('q1');
    expect(result!.cyclePeopleToCreate[0].cycleCapacity).toBe(80);
  });

  it('does not create a duplicate CyclePerson for someone already in the quarter', () => {
    const project = makeProject({ id: 'p1' });
    const person = makePerson({ id: 'eng-1' });
    const existingQP: CyclePerson = {
      id: 'qp-eng-1',
      cycleId: 'q1',
      personId: 'eng-1',
      subteamId: null,
      inactive: false,
      cycleCapacity: 100,
      overheadOverride: null,
    };
    const templateAllocation = makeAllocation({
      id: 'tmpl-1',
      personId: 'eng-1',
      projectId: 'p1',
      role: 'Engineer',
      cycleId: '',
    });
    const result = planAddProjectToCycle(
      {
        quarter,
        cycleProjects: [],
        cyclePeople: [existingQP],
        projects: [project],
        people: [person],
        allAllocations: [templateAllocation],
      },
      'p1',
      nextId,
    );
    expect(result!.cyclePeopleToCreate).toHaveLength(0);
  });

  it('produces no allocations or quarter people when there are no template or sibling allocations', () => {
    const project = makeProject({ id: 'p1', subteamId: null });
    const result = planAddProjectToCycle(
      {
        quarter,
        cycleProjects: [],
        cyclePeople: [],
        projects: [project],
        people: [],
        allAllocations: [],
      },
      'p1',
      nextId,
    );
    expect(result!.allocationsToCreate).toHaveLength(0);
    expect(result!.cyclePeopleToCreate).toHaveLength(0);
  });

  it('syncs from sibling project roster when no template allocations exist', () => {
    const siblingProject = makeProject({ id: 'sibling', subteamId: 'st1' });
    const newProject = makeProject({ id: 'new-p', subteamId: 'st1' });
    const person = makePerson({ id: 'eng-1' });
    const dri = makePerson({ id: 'dri-1' });
    const siblingDriAllocation = makeAllocation({
      id: 'sib-dri',
      personId: 'dri-1',
      projectId: 'sibling',
      role: 'DRI',
      cycleId: 'q1',
    });
    // Active allocation on sibling project in the quarter
    const siblingAllocation = makeAllocation({
      id: 'sib-alloc',
      personId: 'eng-1',
      projectId: 'sibling',
      role: 'Engineer',
      cycleId: 'q1',
    });
    const result = planAddProjectToCycle(
      {
        quarter,
        cycleProjects: [],
        cyclePeople: [],
        projects: [siblingProject, newProject],
        people: [person, dri],
        allAllocations: [siblingDriAllocation, siblingAllocation],
      },
      'new-p',
      nextId,
    );
    expect(result).not.toBeNull();
    expect(result!.allocationsToCreate.some((a) => a.personId === 'eng-1' && a.projectId === 'new-p')).toBe(true);
    expect(result!.allocationsToCreate.some((a) => a.personId === 'dri-1' && a.projectId === 'new-p' && a.role === 'DRI')).toBe(true);
  });
});
