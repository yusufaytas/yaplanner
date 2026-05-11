import type { Project } from './types';

export function normalizeProjectTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeProjectTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const next = normalizeProjectTag(tag);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }

  return normalized;
}

export function parseProjectTagsInput(input: string): string[] {
  return normalizeProjectTags(input.split(','));
}

export function formatProjectTags(tags: string[] | undefined): string {
  return normalizeProjectTags(tags ?? []).join(', ');
}

export function getProjectTags(project: Pick<Project, 'tags'> | { tags?: string[] }): string[] {
  return normalizeProjectTags(project.tags ?? []);
}

export function projectHasTag(project: Pick<Project, 'tags'> | { tags?: string[] }, tag: string): boolean {
  const normalizedTag = normalizeProjectTag(tag);
  if (!normalizedTag) return false;
  return getProjectTags(project).includes(normalizedTag);
}

export function filterProjectsByTag<T extends Pick<Project, 'tags'>>(projects: T[], tag: string): T[] {
  return projects.filter((project) => projectHasTag(project, tag));
}

export function filterProjectsByTags<T extends Pick<Project, 'tags'>>(projects: T[], tags: string[]): T[] {
  const normalizedTags = normalizeProjectTags(tags);
  if (normalizedTags.length === 0) return projects;
  return projects.filter((project) => normalizedTags.every((tag) => projectHasTag(project, tag)));
}

export function filterTagOptions(tags: string[], query: string): string[] {
  const normalizedQuery = normalizeProjectTag(query);
  const normalizedTags = normalizeProjectTags(tags);
  if (!normalizedQuery) return normalizedTags;
  return normalizedTags.filter((tag) => tag.includes(normalizedQuery));
}

export function listProjectTags(projects: Array<Pick<Project, 'tags'> | { tags?: string[] }>): string[] {
  return normalizeProjectTags(projects.flatMap((project) => getProjectTags(project)));
}
