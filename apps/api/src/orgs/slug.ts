import { randomBytes } from 'node:crypto';

/** kebab(name) truncated to 40 chars + '-' + 6 hex chars. */
export function makeSlug(name: string): string {
  const kebab =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org';
  return `${kebab}-${randomBytes(3).toString('hex')}`;
}
