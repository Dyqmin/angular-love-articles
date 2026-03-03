import { describe, it, expect } from 'vitest';
import { validateSlug, validateFrontmatter } from './validation.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function validFrontmatter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Signals in Angular',
    slug: 'signals-in-angular',
    author: 'author@example.com',
    date: '2024-01-01T00:00:00Z',
    category: 'Angular',
    tags: ['signals', 'angular'],
    status: 'draft',
    difficulty: 'intermediate',
    excerpt: 'A short excerpt',
    ...overrides,
  };
}

// ── validateSlug ──────────────────────────────────────────────────────────────

describe('validateSlug', () => {
  describe('valid slugs', () => {
    it.each([
      'signals-in-angular-19',
      'rxjs',
      'a-b-c',
      'angular-19',
      'my-post',
      'abc123',
      'a1-b2-c3',
    ])('"%s" passes when slug matches folder name', (slug) => {
      expect(validateSlug(slug, slug)).toEqual([]);
    });
  });

  describe('folder name mismatch', () => {
    it('fails when slug does not match folder name', () => {
      const errors = validateSlug('my-post', 'different-folder');
      expect(errors.some((e) => e.includes('does not match'))).toBe(true);
    });

    it('passes when slug matches folder name exactly', () => {
      expect(validateSlug('my-post', 'my-post')).toEqual([]);
    });

    it('accumulates both mismatch and format errors', () => {
      const errors = validateSlug('My Post', 'my-post');
      expect(errors.some((e) => e.includes('does not match'))).toBe(true);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('format — uppercase', () => {
    it('fails on PascalCase', () => {
      const errors = validateSlug('Signals-In-Angular', 'Signals-In-Angular');
      expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
    });

    it('fails on mixed case', () => {
      const errors = validateSlug('signalsInAngular', 'signalsInAngular');
      expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
    });

    it('fails on single uppercase letter', () => {
      const errors = validateSlug('A', 'A');
      expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
    });
  });

  describe('format — spaces', () => {
    it('fails on space-separated words', () => {
      const errors = validateSlug('signals in angular', 'signals in angular');
      expect(errors.some((e) => e.includes('space'))).toBe(true);
    });

    it('fails on leading space', () => {
      const errors = validateSlug(' signals', ' signals');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('format — Polish / non-ASCII characters', () => {
    it.each([
      'sygnały-w-angular',
      'angulär',
      'tête',
      'café',
    ])('"%s" fails with non-ASCII characters', (slug) => {
      const errors = validateSlug(slug, slug);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('format — hyphens', () => {
    it('fails on leading hyphen', () => {
      const errors = validateSlug('-signals', '-signals');
      expect(errors.some((e) => e.includes('hyphen'))).toBe(true);
    });

    it('fails on trailing hyphen', () => {
      const errors = validateSlug('signals-', 'signals-');
      expect(errors.some((e) => e.includes('hyphen'))).toBe(true);
    });

    it('fails on both leading and trailing hyphens', () => {
      const errors = validateSlug('-signals-', '-signals-');
      expect(errors.some((e) => e.includes('hyphen'))).toBe(true);
    });

    it('fails on consecutive hyphens', () => {
      const errors = validateSlug('signals--angular', 'signals--angular');
      expect(errors.some((e) => e.includes('consecutive'))).toBe(true);
    });

    it('fails on triple hyphens', () => {
      const errors = validateSlug('signals---angular', 'signals---angular');
      expect(errors.some((e) => e.includes('consecutive'))).toBe(true);
    });
  });

  describe('format — special characters', () => {
    it('fails on @', () => {
      expect(validateSlug('signals@angular', 'signals@angular').length).toBeGreaterThan(0);
    });

    it('fails on underscore', () => {
      expect(validateSlug('signals_angular', 'signals_angular').length).toBeGreaterThan(0);
    });

    it('fails on dot', () => {
      expect(validateSlug('signals.angular', 'signals.angular').length).toBeGreaterThan(0);
    });

    it('fails on slash', () => {
      expect(validateSlug('signals/angular', 'signals/angular').length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('fails on empty string', () => {
      const errors = validateSlug('', '');
      expect(errors).toContain('slug is required');
    });

    it('does not crash on a 255-character valid slug', () => {
      const slug = ('a' + '-b').repeat(85).slice(0, 255);
      const errors = validateSlug(slug, slug);
      expect(Array.isArray(errors)).toBe(true);
    });

    it('fails on a 255-character string of hyphens', () => {
      const slug = '-'.repeat(255);
      const errors = validateSlug(slug, slug);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

// ── validateFrontmatter ───────────────────────────────────────────────────────

describe('validateFrontmatter', () => {
  const FILE = 'posts/signals-in-angular/en.md';
  const FOLDER = 'signals-in-angular';

  it('passes for fully valid frontmatter', () => {
    const { errors, frontmatter } = validateFrontmatter(validFrontmatter(), FOLDER, FILE);
    expect(errors).toEqual([]);
    expect(frontmatter).toBeDefined();
    expect(frontmatter!.title).toBe('Signals in Angular');
  });

  describe('required fields', () => {
    it.each(['title', 'slug', 'author', 'date', 'category', 'status', 'difficulty', 'excerpt'])(
      'fails when "%s" is missing',
      (field) => {
        const data = validFrontmatter({ [field]: undefined });
        const { errors } = validateFrontmatter(data, FOLDER, FILE);
        expect(errors.some((e) => e.includes(field))).toBe(true);
      },
    );

    it('fails when title is empty string', () => {
      const { errors } = validateFrontmatter(validFrontmatter({ title: '' }), FOLDER, FILE);
      expect(errors.some((e) => e.includes('title'))).toBe(true);
    });

    it('fails when tags is missing', () => {
      const { errors } = validateFrontmatter(validFrontmatter({ tags: undefined }), FOLDER, FILE);
      expect(errors.some((e) => e.includes('tags'))).toBe(true);
    });

    it('passes when tags is an empty array', () => {
      const { errors } = validateFrontmatter(validFrontmatter({ tags: [] }), FOLDER, FILE);
      expect(errors).toEqual([]);
    });

    it('coverImage is optional — passes when absent', () => {
      const data = validFrontmatter({ coverImage: undefined });
      const { errors } = validateFrontmatter(data, FOLDER, FILE);
      expect(errors).toEqual([]);
    });
  });

  describe('stops early when required fields are missing', () => {
    it('returns required-field errors without running enum checks', () => {
      const data = validFrontmatter({ title: undefined, status: 'invalid-status' });
      const { errors } = validateFrontmatter(data, FOLDER, FILE);
      // Should only report the missing required field, not the invalid enum
      expect(errors.some((e) => e.includes('title'))).toBe(true);
      expect(errors.every((e) => !e.includes('invalid status'))).toBe(true);
    });
  });

  describe('status field', () => {
    it.each(['draft', 'publish', 'trash'])('accepts status "%s"', (status) => {
      const { errors } = validateFrontmatter(validFrontmatter({ status }), FOLDER, FILE);
      expect(errors).toEqual([]);
    });

    it.each(['published', 'Draft', 'active', 'pending', ''])(
      'rejects invalid status "%s"',
      (status) => {
        const data = validFrontmatter({ status: status || undefined });
        const { errors } = validateFrontmatter(data, FOLDER, FILE);
        expect(errors.length).toBeGreaterThan(0);
      },
    );
  });

  describe('difficulty field', () => {
    it.each(['beginner', 'intermediate', 'advanced'])('accepts difficulty "%s"', (difficulty) => {
      const { errors } = validateFrontmatter(validFrontmatter({ difficulty }), FOLDER, FILE);
      expect(errors).toEqual([]);
    });

    it.each(['easy', 'hard', 'Intermediate', 'expert'])(
      'rejects invalid difficulty "%s"',
      (difficulty) => {
        const { errors } = validateFrontmatter(validFrontmatter({ difficulty }), FOLDER, FILE);
        expect(errors.some((e) => e.includes('difficulty'))).toBe(true);
      },
    );
  });

  describe('author email', () => {
    it.each([
      'user@example.com',
      'author@angular.love',
      'first.last@sub.domain.com',
    ])('accepts valid email "%s"', (author) => {
      const { errors } = validateFrontmatter(validFrontmatter({ author }), FOLDER, FILE);
      expect(errors).toEqual([]);
    });

    it.each(['notanemail', 'missing@', '@nodomain', 'no spaces@example.com'])(
      'rejects invalid email "%s"',
      (author) => {
        const { errors } = validateFrontmatter(validFrontmatter({ author }), FOLDER, FILE);
        expect(errors.some((e) => e.includes('email'))).toBe(true);
      },
    );
  });

  describe('tags field', () => {
    it('fails when tags is a string instead of array', () => {
      const { errors } = validateFrontmatter(validFrontmatter({ tags: 'angular' }), FOLDER, FILE);
      expect(errors.some((e) => e.includes('tags'))).toBe(true);
    });

    it('fails when tags is a number', () => {
      const { errors } = validateFrontmatter(validFrontmatter({ tags: 42 }), FOLDER, FILE);
      expect(errors.some((e) => e.includes('tags'))).toBe(true);
    });
  });

  describe('slug validation integration', () => {
    it('fails when frontmatter slug does not match folder name', () => {
      const data = validFrontmatter({ slug: 'wrong-slug' });
      const { errors } = validateFrontmatter(data, FOLDER, FILE);
      expect(errors.some((e) => e.includes('does not match'))).toBe(true);
    });

    it('fails when frontmatter slug has invalid format', () => {
      const data = validFrontmatter({ slug: 'Signals-In-Angular', title: 'x' });
      const { errors } = validateFrontmatter(data, 'Signals-In-Angular', FILE);
      expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
    });
  });

  describe('error context', () => {
    it('includes the file path in every error message', () => {
      const data = validFrontmatter({ title: undefined, status: undefined });
      const { errors } = validateFrontmatter(data, FOLDER, 'posts/my-post/pl.md');
      expect(errors.every((e) => e.includes('[posts/my-post/pl.md]'))).toBe(true);
    });

    it('collects multiple errors at once', () => {
      const data = validFrontmatter({
        status: 'bad-status',
        difficulty: 'bad-difficulty',
        author: 'not-an-email',
      });
      // All three invalid values should produce errors
      const { errors } = validateFrontmatter(data, FOLDER, FILE);
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
