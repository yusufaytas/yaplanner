import { describe, expect, it } from 'vitest';
import { computeEffectiveCapacity, resolveOverhead } from './types';
import type { CapacityOverhead } from './types';

describe('computeEffectiveCapacity', () => {
  it('returns baseCapacity unchanged when there are no overhead items', () => {
    expect(computeEffectiveCapacity(100, { items: [] }, 13)).toBe(100);
  });

  it('applies a percentage overhead item by multiplying (1 - value/100)', () => {
    // 100 * (1 - 10/100) = 90
    expect(computeEffectiveCapacity(100, { items: [{ id: 'meetings', label: 'Meetings', type: 'pct', value: 10 }] }, 13)).toBe(90);
  });

  it('applies a weeks overhead item relative to total quarter weeks', () => {
    // 100 * (1 - 1/13) ≈ 92.3 → rounds to 92
    expect(computeEffectiveCapacity(100, { items: [{ id: 'pto', label: 'PTO', type: 'weeks', value: 1 }] }, 13)).toBe(92);
  });

  it('compounds multiple overhead items sequentially', () => {
    // 100 * (1 - 1/13) * (1 - 10/100) * (1 - 5/100)
    // ≈ 100 * 0.923 * 0.9 * 0.95 ≈ 78.9 → rounds to 79
    const overhead: CapacityOverhead = {
      items: [
        { id: 'pto', label: 'PTO', type: 'weeks', value: 1 },
        { id: 'meetings', label: 'Meetings', type: 'pct', value: 10 },
        { id: 'learning', label: 'Learning', type: 'pct', value: 5 },
      ],
    };
    expect(computeEffectiveCapacity(100, overhead, 13)).toBe(79);
  });

  it('clamps the result to 0 when overhead exceeds base capacity', () => {
    const overhead: CapacityOverhead = {
      items: [{ id: 'all', label: 'All', type: 'pct', value: 100 }],
    };
    expect(computeEffectiveCapacity(100, overhead, 13)).toBe(0);
  });

  it('handles a weeks item when totalQuarterWeeks is 0 (no reduction)', () => {
    // fraction = 0/0 = 0, so no reduction
    expect(computeEffectiveCapacity(80, { items: [{ id: 'pto', label: 'PTO', type: 'weeks', value: 1 }] }, 0)).toBe(80);
  });

  it('works with a non-100 base capacity', () => {
    // 80 * (1 - 10/100) = 72
    expect(computeEffectiveCapacity(80, { items: [{ id: 'meetings', label: 'Meetings', type: 'pct', value: 10 }] }, 13)).toBe(72);
  });

  it('returns 0 for a 0 base capacity regardless of overhead', () => {
    expect(computeEffectiveCapacity(0, { items: [{ id: 'meetings', label: 'Meetings', type: 'pct', value: 10 }] }, 13)).toBe(0);
  });
});

describe('resolveOverhead', () => {
  const quarterOverhead: CapacityOverhead = {
    items: [{ id: 'meetings', label: 'Meetings', type: 'pct', value: 10 }],
  };
  const personOverride: CapacityOverhead = {
    items: [{ id: 'custom', label: 'Custom', type: 'pct', value: 20 }],
  };

  it('returns the quarter overhead when no person override is set', () => {
    expect(resolveOverhead(quarterOverhead, null)).toBe(quarterOverhead);
  });

  it('returns the person override when one is set', () => {
    expect(resolveOverhead(quarterOverhead, personOverride)).toBe(personOverride);
  });

  it('person override completely replaces quarter overhead (not merged)', () => {
    const resolved = resolveOverhead(quarterOverhead, personOverride);
    expect(resolved.items).toHaveLength(1);
    expect(resolved.items[0].id).toBe('custom');
  });
});
