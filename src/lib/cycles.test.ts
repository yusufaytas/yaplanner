import { describe, expect, it } from 'vitest';
import {
  getActiveCycle,
  getAutoCycleStatus,
  getDefaultCycleEndDate,
  getCycleEditStatus,
  getStoredCycleStatusForEditStatus,
  suggestNextCycle,
  updateCycleDraftEndDate,
  updateCycleDraftStartDate,
} from './cycles';
import type { Cycle } from './types';

const baseCycle = {
  createdAt: '2026-01-01T00:00:00.000Z',
  createdFromCycleId: null,
  capacityLineAfter: null,
  overhead: { items: [] },
} satisfies Omit<Cycle, 'id' | 'name' | 'startDate' | 'endDate' | 'status'>;

describe('quarter status helpers', () => {
  it('computes a standard 13-week quarter end date from the start date', () => {
    expect(getDefaultCycleEndDate('2026-06-29')).toBe('2026-09-27');
  });

  it('updates draft dates from start date until the end date is manually overridden', () => {
    expect(updateCycleDraftStartDate({
      startDate: '',
      endDate: '',
      endDateManuallyEdited: false,
    }, '2026-06-29')).toEqual({
      startDate: '2026-06-29',
      endDate: '2026-09-27',
      endDateManuallyEdited: false,
    });

    expect(updateCycleDraftStartDate({
      startDate: '2026-06-29',
      endDate: '2026-10-01',
      endDateManuallyEdited: true,
    }, '2026-07-06')).toEqual({
      startDate: '2026-07-06',
      endDate: '2026-10-01',
      endDateManuallyEdited: true,
    });
  });

  it('marks the end date as manually edited when directly changed', () => {
    expect(updateCycleDraftEndDate({
      startDate: '2026-06-29',
      endDate: '2026-09-27',
      endDateManuallyEdited: false,
    }, '2026-10-01')).toEqual({
      startDate: '2026-06-29',
      endDate: '2026-10-01',
      endDateManuallyEdited: true,
    });
  });

  it('suggests the next quarter dates and name from the previous one', () => {
    expect(suggestNextCycle({
      name: '2026-Q3',
      startDate: '2026-06-29',
      endDate: '2026-09-27',
    })).toEqual({
      name: '2026-Q4',
      startDate: '2026-09-28',
      endDate: '2026-12-27',
    });
  });

  it('auto-activates a draft quarter when today falls within its dates', () => {
    expect(getAutoCycleStatus({
      status: 'draft',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    }, '2026-05-11')).toBe('active');
  });

  it('treats the start and end dates as active boundaries', () => {
    expect(getAutoCycleStatus({
      status: 'draft',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    }, '2026-04-01')).toBe('active');
    expect(getAutoCycleStatus({
      status: 'draft',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    }, '2026-06-30')).toBe('active');
  });

  it('closes a non-archived quarter after its end date', () => {
    expect(getAutoCycleStatus({
      status: 'draft',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    }, '2026-04-01')).toBe('closed');
  });

  it('preserves archived quarters', () => {
    expect(getAutoCycleStatus({
      status: 'archived',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    }, '2026-02-01')).toBe('archived');
  });

  it('maps edit status between stored and editable quarter modes', () => {
    expect(getCycleEditStatus('draft')).toBe('auto');
    expect(getCycleEditStatus('active')).toBe('active');
    expect(getCycleEditStatus('closed')).toBe('closed');
    expect(getCycleEditStatus('archived')).toBe('archived');
    expect(getStoredCycleStatusForEditStatus('auto')).toBe('draft');
    expect(getStoredCycleStatusForEditStatus('active')).toBe('active');
    expect(getStoredCycleStatusForEditStatus('closed')).toBe('closed');
    expect(getStoredCycleStatusForEditStatus('archived')).toBe('archived');
  });

  it('respects manual active/closed overrides regardless of dates', () => {
    expect(getAutoCycleStatus({
      status: 'active',
      startDate: '2026-07-01',
      endDate: '2026-09-30',
    }, '2026-05-11')).toBe('active');

    expect(getAutoCycleStatus({
      status: 'closed',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    }, '2026-05-11')).toBe('closed');
  });

  it('returns the current active quarter by date', () => {
    const quarters: Cycle[] = [
      {
        id: 'q1',
        name: '2026-Q1',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        status: 'draft',
        ...baseCycle,
      },
      {
        id: 'q2',
        name: '2026-Q2',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        status: 'draft',
        ...baseCycle,
      },
    ];

    expect(getActiveCycle(quarters, '2026-05-11')?.id).toBe('q2');
  });

  it('prefers the most recent active quarter if ranges overlap', () => {
    const quarters: Cycle[] = [
      {
        id: 'q1',
        name: '2026-Q2a',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        status: 'draft',
        ...baseCycle,
      },
      {
        id: 'q2',
        name: '2026-Q2b',
        startDate: '2026-05-01',
        endDate: '2026-07-31',
        status: 'draft',
        ...baseCycle,
      },
    ];

    expect(getActiveCycle(quarters, '2026-05-11')?.id).toBe('q2');
  });

  it('returns null when no quarter is active for the date', () => {
    const quarters: Cycle[] = [
      {
        id: 'q1',
        name: '2026-Q1',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        status: 'draft',
        ...baseCycle,
      },
    ];

    expect(getActiveCycle(quarters, '2026-05-11')).toBeNull();
  });
});
