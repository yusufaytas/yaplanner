import { describe, expect, it } from 'vitest';
import {
  filterTagOptions,
  filterProjectsByTag,
  filterProjectsByTags,
  formatProjectTags,
  getProjectTags,
  listProjectTags,
  parseProjectTagsInput,
  projectHasTag,
} from './project-tags';

describe('project tags', () => {
  it('parses comma-separated tags into normalized unique values', () => {
    expect(parseProjectTagsInput('Platform, infra,  Platform  , mobile app ')).toEqual([
      'platform',
      'infra',
      'mobile app',
    ]);
  });

  it('formats tags for editing', () => {
    expect(formatProjectTags(['platform', 'infra'])).toBe('platform, infra');
    expect(formatProjectTags(undefined)).toBe('');
  });

  it('returns normalized tags for projects even when missing', () => {
    expect(getProjectTags({ tags: [' Platform ', 'infra'] })).toEqual(['platform', 'infra']);
    expect(getProjectTags({})).toEqual([]);
  });

  it('matches tags case-insensitively', () => {
    const project = { tags: ['platform', 'infra'] };
    expect(projectHasTag(project, 'Platform')).toBe(true);
    expect(projectHasTag(project, 'mobile')).toBe(false);
  });

  it('filters projects by tag', () => {
    const projects = [
      { id: 'p1', tags: ['platform', 'infra'] },
      { id: 'p2', tags: ['mobile'] },
    ];
    expect(filterProjectsByTag(projects, 'infra').map((project) => project.id)).toEqual(['p1']);
  });

  it('filters projects by multiple tags using an all-tags match', () => {
    const projects = [
      { id: 'p1', tags: ['platform', 'infra'] },
      { id: 'p2', tags: ['platform'] },
      { id: 'p3', tags: ['infra', 'mobile'] },
    ];
    expect(filterProjectsByTags(projects, ['platform', 'infra']).map((project) => project.id)).toEqual(['p1']);
    expect(filterProjectsByTags(projects, []).map((project) => project.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('lists unique normalized tags across projects', () => {
    const projects = [
      { tags: ['platform', 'infra'] },
      { tags: ['Mobile', 'platform'] },
      {},
    ];
    expect(listProjectTags(projects)).toEqual(['platform', 'infra', 'mobile']);
  });

  it('filters available tag options by query', () => {
    expect(filterTagOptions(['platform', 'infra', 'mobile app'], 'app')).toEqual(['mobile app']);
    expect(filterTagOptions(['platform', 'infra'], '')).toEqual(['platform', 'infra']);
  });
});
