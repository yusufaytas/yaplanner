function sanitizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function suggestSubteamName(value: string): string {
  const words = sanitizeWords(value);
  if (words.length === 0) return '';

  const parts: string[] = [];
  let remaining = 10;

  for (const word of words) {
    const separatorCost = parts.length > 0 ? 1 : 0;
    const take = Math.min(word.length, parts.length === 0 ? 4 : 3, remaining - separatorCost);
    if (take <= 0) break;
    if (separatorCost === 1) remaining -= 1;
    parts.push(word.slice(0, take));
    remaining -= take;
  }

  const candidate = parts.join('_');
  if (candidate.length > 0) return candidate.slice(0, 10);

  return words.join('').slice(0, 10);
}

export function normalizeSubteamName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 10);
}
