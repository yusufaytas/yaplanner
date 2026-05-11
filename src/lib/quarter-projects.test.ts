import { describe, expect, it } from 'vitest';
import { planAddProjectToQuarter } from './quarter-projects';
import type { Allocation, Person, Project, Quarter, QuarterPerson, QuarterProject } from './types';

const quarter: Quarter = {
  id: 'q1',
  name: '2026-Q2',
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  status: 'active',
  createdAt: '2026-03-01T00:00:00.000Z',
  createdFromQuarterId: null,
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
    quarterId: '',
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

describe('planAddProjectToQuarter', () => {
  it('returns null when the project does not exist', () => {
    const result = planAddProjectToQuarter(
      {
        quarter,
        quarterProjects: [],
        quarterPeople: [],
        projects: [],
        people: [],
        allAllocations: [],
      },
      'nonexistent',
      nextId,
    );
    expect(result).toBeNull();
  });

  it('creates a QuarterProject record with the correct quarterId and projectId', () => {
    const project = makeProject({ id: 'p1' });
    const result = planAddProjectToQuarter(
      {
        quarter,
        quarterProjects: [],
        quarterPeople: [],
        projects: [project],
        people: [],
        allAllocations: [],
      },
      'p1',
      nextId,
    );
    expect(result).not.toBeNull();
    expect(result!.quarterProjectToCreate.quarterId).toBe('q1');
    expect(result!.quarterProjectToCreate.projectId).toBe('p1');
  });

  it('sets priority to the current number of quarter projects', () => {
    const project = makeProject({ id: 'p1' });
    const existingQP: QuarterProject = {
      id: 'qp-existing',
      quarterId: 'q1',
      projectId: 'p-other',
      status: 'Active',
      priority: 0,
      estimatedPersonWeeks: null,
      notes: '',
      plannedStartWeek: null,
      plannedEndWeek: null,
      targetMilestone: null,
    };
    const result = planAddProjectToQuarter(
      {
        quarter,
        quarterProjects: [existingQP],
        quarterPeople: [],
        projects: [project],
        people: [],
        allAllocations: [],
      },
      'p1',
      nextId,
    );
    expect(result!.quarterProjectToCreate.priority).toBe(1);
  });

  it('uses template allocations (quarterId="") when they exist', () => {
    const project = makeProject({ id: 'p1', subteamId: 'st1' });
    const person = makePerson({ id: 'eng-1' });
    const templateAllocation = makeAllocation({
      id: 'tmpl-1',
      personId: 'eng-1',
      projectId: 'p1',
      role: 'Engineer',
      quarterId: '',
    });
    const result = planAddProjectToQuarter(
      {
        quarter,
        quarterProjects: [],
        quarterPeople: [],
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
    expect(result!.allocationsToCreate[0].quarterId).toBe('q1');
    expect(result!.allocationsToCreate[0].startDate).toBe(quarter.startDate);
    expect(result!.allocationsToCreate[0].endDate).toBeNull();
  });

  it('creates a QuarterPerson entry for people not yet in the quarter', () => {
    const project = makeProject({ id: 'p1' });
    const person = makePerson({ id: 'eng-1', defaultCapacity: 80 });
    const templateAllocation = makeAllocation({
      id: 'tmpl-1',
      personId: 'eng-1',
      projectId: 'p1',
      role: 'Engineer',
      quarterId: '',
    });
    const result = planAddProjectToQuarter(
      {
        quarter,
        quarterProjects: [],
        quarterPeople: [],
        projects: [project],
        people: [person],
        allAllocations: [templateAllocation],
      },
      'p1',
      nextId,
    );
    expect(result!.quarterPeopleToCreate).toHaveLength(1);
    expect(result!.quarterPeopleToCreate[0].personId).toBe('eng-1');
    expect(result!.quarterPeopleToCreate[0].quarterId).toBe('q1');
    expect(result!.quarterPeopleToCreate[0].quarterCapacity).toBe(80);
  });

  it('does not create a duplicate QuarterPerson for someone already in the quarter', () => {
    const project = makeProject({ id: 'p1' });
    const person = makePerson({ id: 'eng-1' });
    const existingQP: QuarterPerson = {
      id: 'qp-eng-1',
      quarterId: 'q1',
      personId: 'eng-1',
      subteamId: null,
      inactive: false,
      quarterCapacity: 100,
      overheadOverride: null,
    };
    const templateAllocation = makeAllocation({
      id: 'tmpl-1',
      personId: 'eng-1',
      projectId: 'p1',
      role: 'Engineer',
      quarterId: '',
    });
    const result = planAddProjectToQuarter(
      {
        quarter,
        quarterProjects: [],
        quarterPeople: [existingQP],
        projects: [project],
        people: [person],
        allAllocations: [templateAllocation],
      },
      'p1',
      nextId,
    );
    expect(result!.quarterPeopleToCreate).toHaveLength(0);
  });

  it('produces no allocations or quarter people when there are no template or sibling allocations', () => {
    const project = makeProject({ id: 'p1', subteamId: null });
    const result = planAddProjectToQuarter(
      {
        quarter,
        quarterProjects: [],
        quarterPeople: [],
        projects: [project],
        people: [],
        allAllocations: [],
      },
      'p1',
      nextId,
    );
    expect(result!.allocationsToCreate).toHaveLength(0);
    expect(result!.quarterPeopleToCreate).toHaveLength(0);
  });

  it('syncs from sibling project roster when no template allocations exist', () => {
    const siblingProject = makeProject({ id: 'sibling', subteamId: 'st1' });
    const newProject = makeProject({ id: 'new-p', subteamId: 'st1' });
    const person = makePerson({ id: 'eng-1' });
    // Active allocation on sibling project in the quarter
    const siblingAllocation = makeAllocation({
      id: 'sib-alloc',
      personId: 'eng-1',
      projectId: 'sibling',
      role: 'Engineer',
      quarterId: 'q1',
    });
    const result = planAddProjectToQuarter(
      {
        quarter,
        quarterProjects: [],
        quarterPeople: [],
        projects: [siblingProject, newProject],
        people: [person],
        allAllocations: [siblingAllocation],
      },
      'new-p',
      nextId,
    );
    expect(result).not.toBeNull();
    expect(result!.allocationsToCreate.some((a) => a.personId === 'eng-1' && a.projectId === 'new-p')).toBe(true);
  });
});
