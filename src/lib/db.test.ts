import { describe, expect, it } from 'vitest';
import { DB_SCHEMA } from './db';

describe('database schema', () => {
  it('uses explicit string primary keys', () => {
    expect(DB_SCHEMA.people.startsWith('id')).toBe(true);
    expect(DB_SCHEMA.subteams.startsWith('id')).toBe(true);
    expect(DB_SCHEMA.projects.startsWith('id')).toBe(true);
    expect(DB_SCHEMA.cycles.startsWith('id')).toBe(true);
    expect(DB_SCHEMA.cycleProjects.startsWith('id')).toBe(true);
    expect(DB_SCHEMA.cyclePeople.startsWith('id')).toBe(true);
    expect(DB_SCHEMA.allocations.startsWith('id')).toBe(true);
  });

  it('adds compound uniqueness for cycle membership rows', () => {
    expect(DB_SCHEMA.cycleProjects).toContain('&[cycleId+projectId]');
    expect(DB_SCHEMA.cyclePeople).toContain('&[cycleId+personId]');
  });

  it('adds an allocation uniqueness index', () => {
    expect(DB_SCHEMA.allocations).toContain('&[cycleId+personId+projectId+role+startDate+endDate]');
  });
});
