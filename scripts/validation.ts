import type { PostFrontmatter } from './types.js';

const VALID_STATUSES = new Set(['draft', 'publish', 'trash']);
const VALID_DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Lowercase alphanumeric + hyphens, no leading/trailing/consecutive hyphens
const SLUG_FORMAT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates a slug value against format rules and the expected folder name.
 * Returns an array of error strings (empty = valid).
 */
export function validateSlug(slug: string, folderName: string): string[] {
  const errors: string[] = [];

  if (!slug) {
    errors.push('slug is required');
    return errors;
  }

  if (slug !== folderName) {
    errors.push(`slug "${slug}" does not match folder name "${folderName}"`);
  }

  if (!SLUG_FORMAT_RE.test(slug)) {
    if (slug !== slug.toLowerCase()) {
      errors.push(`slug must be lowercase (got "${slug}")`);
    } else if (/\s/.test(slug)) {
      errors.push(`slug must not contain spaces (got "${slug}")`);
    } else if (slug.startsWith('-') || slug.endsWith('-')) {
      errors.push(`slug must not start or end with a hyphen (got "${slug}")`);
    } else if (/--/.test(slug)) {
      errors.push(`slug must not contain consecutive hyphens (got "${slug}")`);
    } else {
      errors.push(
        `slug must contain only lowercase letters, digits and hyphens (got "${slug}")`,
      );
    }
  }

  return errors;
}

/**
 * Validates all required frontmatter fields and enum values.
 * Returns { errors, frontmatter } — frontmatter is set only when errors is empty.
 */
export function validateFrontmatter(
  data: unknown,
  folderName: string,
  filePath: string,
): { errors: string[]; frontmatter?: PostFrontmatter } {
  const f = data as Record<string, unknown>;
  const errors: string[] = [];
  const ctx = `[${filePath}]`;

  const required = ['title', 'slug', 'author', 'date', 'category', 'tags', 'status', 'difficulty', 'excerpt'];
  for (const field of required) {
    if (f[field] === undefined || f[field] === null || f[field] === '') {
      errors.push(`${ctx} missing required frontmatter field: ${field}`);
    }
  }

  // Stop early if required fields are missing — further checks would be noisy
  if (errors.length > 0) return { errors };

  const slugErrors = validateSlug(f['slug'] as string, folderName);
  for (const e of slugErrors) errors.push(`${ctx} ${e}`);

  if (!VALID_STATUSES.has(f['status'] as string)) {
    errors.push(`${ctx} invalid status "${f['status']}" — must be: draft | publish | trash`);
  }
  if (!VALID_DIFFICULTIES.has(f['difficulty'] as string)) {
    errors.push(`${ctx} invalid difficulty "${f['difficulty']}" — must be: beginner | intermediate | advanced`);
  }
  if (!EMAIL_RE.test(f['author'] as string)) {
    errors.push(`${ctx} invalid author email "${f['author']}"`);
  }
  if (!Array.isArray(f['tags'])) {
    errors.push(`${ctx} "tags" must be an array`);
  }

  if (errors.length > 0) return { errors };
  return { errors: [], frontmatter: f as unknown as PostFrontmatter };
}
