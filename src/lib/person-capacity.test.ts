import { describe, expect, it } from 'vitest';

import {
  clampProjectAllocationPercentage,
  getAssignableEngineers,
  getMaxProjectAllocationPercentage,
  getPersonProjectCapacityShares,
  getProjectCapacitySummary,
  getPersonRemainingAllocationPct,
  getCyclePersonAvailableWeeks,
  getCyclePersonProjectSummary,
} from './person-capacity';
import type { Allocation, Person, Cycle, CyclePerson } from './types';

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

const quarterWithOverhead: Cycle = {
  ...quarter,
  id: 'q2',
  name: '2026-Q2-overhead',
  overhead: {
    items: [{ id: 'meetings', label: 'Meetings', type: 'pct', value: 20 }],
  },
};

const engineer: Person = {
  id: 'eng-1',
  name: 'Eng One',
  email: null,
  role: 'Engineer',
  defaultCapacity: 100,
  subteamId: 'subteam-1',
  notes: '',
  createdAt: '2026-03-01T00:00:00.000Z',
};

const engineerCycle: CyclePerson = {
  id: 'qp-1',
  cycleId: quarter.id,
  personId: engineer.id,
  subteamId: 'subteam-1',
  inactive: false,
  cycleCapacity: 80,
  overheadOverride: null,
};

function makeAllocation(overrides: Partial<Allocation> & Pick<Allocation, 'id' | 'personId' | 'projectId' | 'role'>): Allocation {
  return {
    id: overrides.id,
    cycleId: overrides.cycleId ?? quarter.id,
    personId: overrides.personId,
    projectId: overrides.projectId,
    role: overrides.role,
    startDate: overrides.startDate ?? quarter.startDate,
    endDate: overrides.endDate ?? null,
    percentage: overrides.percentage ?? 0,
  };
}

describe('person capacity', () => {
  it('uses actual quarter duration rather than overlapping Monday buckets for available weeks', () => {
    expect(getCyclePersonAvailableWeeks(quarter, engineer, engineerCycle)).toBe(10.4);
  });

  it('treats allocation percentages as shares of effective capacity', () => {
    const allocations = [
      makeAllocation({ id: 'a1', cycleId: quarterWithOverhead.id, personId: engineer.id, projectId: 'p1', role: 'Engineer', percentage: 10 }),
    ];

    const summary = getCyclePersonProjectSummary(quarterWithOverhead, engineer, engineerCycle, allocations);

    expect(summary.capacityLimit).toBe(64);
    expect(summary.effectiveCapacity).toBe(64);
    expect(summary.availableWeeks).toBe(8.3);
    expect(summary.allocatedWeeks).toBe(1.3);
    expect(summary.remainingWeeks).toBe(7);
  });

  it('uses quarter capacity, not default capacity, for remaining allocation percentage', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: engineer.id, projectId: 'p1', role: 'Engineer', percentage: 50 }),
      makeAllocation({ id: 'a2', personId: engineer.id, projectId: 'p2', role: 'Engineer', percentage: 20 }),
    ];

    expect(getPersonRemainingAllocationPct({
      person: engineer,
      cyclePerson: engineerCycle,
      cycleId: quarter.id,
      allocations,
    })).toBe(10);
  });

  it('clamps a project edit to the remaining quarter capacity budget', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: engineer.id, projectId: 'p1', role: 'Engineer', percentage: 50 }),
      makeAllocation({ id: 'a2', personId: engineer.id, projectId: 'p2', role: 'Engineer', percentage: 20 }),
    ];

    expect(getMaxProjectAllocationPercentage({
      person: engineer,
      projectId: 'p1',
      cyclePerson: engineerCycle,
      cycleId: quarter.id,
      allocations,
    })).toBe(60);

    expect(clampProjectAllocationPercentage({
      person: engineer,
      projectId: 'p1',
      cyclePerson: engineerCycle,
      cycleId: quarter.id,
      allocations,
      requestedPercentage: 90,
    })).toBe(60);
  });

  it('treats sibling zero rows as explicit zero instead of auto-consuming leftover capacity', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: engineer.id, projectId: 'p1', role: 'Engineer', percentage: 50 }),
      makeAllocation({ id: 'a2', personId: engineer.id, projectId: 'p2', role: 'Engineer', percentage: 0 }),
      makeAllocation({ id: 'a3', personId: engineer.id, projectId: 'p3', role: 'Engineer', percentage: 0 }),
    ];

    expect(getPersonProjectCapacityShares({
      person: engineer,
      cyclePerson: engineerCycle,
      cycleId: quarter.id,
      allocations,
    })).toEqual([
      { projectId: 'p1', percentage: 50, isEvenSplit: false },
      { projectId: 'p2', percentage: 0, isEvenSplit: false },
      { projectId: 'p3', percentage: 0, isEvenSplit: false },
    ]);
  });

  it('marks a person as over-allocated once project percentages exceed quarter capacity', () => {
    const allocations = [
      makeAllocation({ id: 'a1', personId: engineer.id, projectId: 'p1', role: 'Engineer', percentage: 50 }),
      makeAllocation({ id: 'a2', personId: engineer.id, projectId: 'p2', role: 'Engineer', percentage: 40 }),
    ];

    const summary = getCyclePersonProjectSummary(quarter, engineer, engineerCycle, allocations);

    expect(summary.capacityLimit).toBe(80);
    expect(summary.totalAllocatedPct).toBe(90);
    expect(summary.overAllocated).toBe(true);
    expect(summary.remainingPct).toBe(0);
  });

  it('uses effective-capacity share when reserving project person-weeks', () => {
    const allocations = [
      makeAllocation({ id: 'a1', cycleId: quarterWithOverhead.id, personId: engineer.id, projectId: 'p1', role: 'Engineer', percentage: 10 }),
    ];

    expect(getProjectCapacitySummary({
      projectId: 'p1',
      quarter: quarterWithOverhead,
      estimatedPersonWeeks: 5,
      people: [engineer],
      cyclePeople: [engineerCycle],
      activeAllocations: allocations,
    })).toEqual({
      estimatedPersonWeeks: 5,
      reservedPersonWeeks: 1.3,
      reservedWeeklyPeople: 0.1,
      remainingPersonWeeks: 3.7,
    });
  });

  it('only considers people assignable when they have remaining quarter capacity', () => {
    const saturatedAllocations = [
      makeAllocation({ id: 'a1', personId: engineer.id, projectId: 'p1', role: 'Engineer', percentage: 80 }),
    ];
    const availableAllocations = [
      makeAllocation({ id: 'b1', personId: engineer.id, projectId: 'p1', role: 'Engineer', percentage: 60 }),
    ];

    expect(getAssignableEngineers([engineer], [engineerCycle], quarter, saturatedAllocations)).toEqual([]);
    expect(getAssignableEngineers([engineer], [engineerCycle], quarter, availableAllocations)).toEqual([engineer]);
  });
});
