/**
 * Integration-level tests for publish.ts with all external dependencies mocked.
 *
 * Env vars (WP_URL, WP_AUTH_USER, WP_AUTH_PASSWORD) are injected via
 * vitest.config.ts `env` so the top-level env check in publish.ts passes at
 * static import time — no dynamic import needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

vi.mock('./diff.js', () => ({
  detectChangedFiles: vi.fn(),
  detectDeletedFiles: vi.fn(),
}));

vi.mock('./validation.js', () => ({
  validateFrontmatter: vi.fn(),
}));

vi.mock('./markdown.js', () => ({
  convertMarkdownToHTML: vi.fn(),
  calculateReadingTime: vi.fn(),
}));

vi.mock('./images.js', () => ({
  scanMarkdownImages: vi.fn(),
  replaceImagePaths: vi.fn(),
}));

vi.mock('gray-matter', () => ({
  default: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('./wordpress.js', () => ({
  WordPressClient: vi.fn(),
}));

// ── Static imports after mocks are registered ─────────────────────────────────

import { main } from './publish.js';
import { detectChangedFiles, detectDeletedFiles } from './diff.js';
import { validateFrontmatter } from './validation.js';
import { convertMarkdownToHTML, calculateReadingTime } from './markdown.js';
import { scanMarkdownImages, replaceImagePaths } from './images.js';
import { WordPressClient } from './wordpress.js';
import matter from 'gray-matter';
import { existsSync, readFileSync } from 'node:fs';
import type { PostFrontmatter } from './types.js';

// ── Typed mock references ─────────────────────────────────────────────────────

const mockDetectChanged  = vi.mocked(detectChangedFiles);
const mockDetectDeleted  = vi.mocked(detectDeletedFiles);
const mockValidate       = vi.mocked(validateFrontmatter);
const MockWPClient       = vi.mocked(WordPressClient);
const mockMatter         = vi.mocked(matter);
const mockExistsSync     = vi.mocked(existsSync);
const mockReadFileSync   = vi.mocked(readFileSync);
const mockConvertHTML    = vi.mocked(convertMarkdownToHTML);
const mockReadingTime    = vi.mocked(calculateReadingTime);
const mockScanImages     = vi.mocked(scanMarkdownImages);
const mockReplaceImages  = vi.mocked(replaceImagePaths);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_FM: PostFrontmatter = {
  title: 'Signals in Angular',
  slug: 'signals-in-angular',
  author: 'author@example.com',
  date: '2024-01-01T00:00:00Z',
  category: 'Angular',
  tags: ['signals'],
  status: 'draft',
  difficulty: 'intermediate',
  excerpt: 'A short excerpt',
};

// ── Per-test mock client instance ─────────────────────────────────────────────

type MockClient = {
  resolveAuthor:   ReturnType<typeof vi.fn>;
  resolveCategory: ReturnType<typeof vi.fn>;
  resolveTag:      ReturnType<typeof vi.fn>;
  findPostBySlug:  ReturnType<typeof vi.fn>;
  createPost:      ReturnType<typeof vi.fn>;
  updatePost:      ReturnType<typeof vi.fn>;
  trashPost:       ReturnType<typeof vi.fn>;
  uploadMedia:     ReturnType<typeof vi.fn>;
};

let mockClient: MockClient;
let processExitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();

  // process.exit — prevent the test process from terminating
  processExitSpy = vi.spyOn(process, 'exit').mockImplementation(
    (() => { throw new Error('process.exit called'); }) as never,
  );

  // Build a fresh mock client for each test
  mockClient = {
    resolveAuthor:   vi.fn().mockResolvedValue(1),
    resolveCategory: vi.fn().mockResolvedValue(2),
    resolveTag:      vi.fn().mockResolvedValue(3),
    findPostBySlug:  vi.fn().mockResolvedValue(null),
    createPost:      vi.fn().mockResolvedValue(42),
    updatePost:      vi.fn().mockResolvedValue(42),
    trashPost:       vi.fn().mockResolvedValue(undefined),
    uploadMedia:     vi.fn().mockResolvedValue({ id: 10, source_url: 'https://test.wp.com/media/img.svg' }),
  };

  // WordPressClient must be a regular function (not arrow) to support `new`
  MockWPClient.mockImplementation(function () {
    return mockClient as unknown as InstanceType<typeof WordPressClient>;
  } as never);

  // Default diff: nothing changed
  mockDetectChanged.mockReturnValue([]);
  mockDetectDeleted.mockReturnValue([]);

  // Default validation: passes
  mockValidate.mockReturnValue({ errors: [], frontmatter: { ...VALID_FM } });

  // Default fs
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue('mock file content' as unknown as ReturnType<typeof readFileSync>);

  // Default matter parse
  mockMatter.mockReturnValue({
    data: { ...VALID_FM },
    content: 'Post body',
    orig: '',
    language: '',
    matter: '',
    stringify: () => '',
  } as unknown as ReturnType<typeof matter>);

  // Default markdown processing
  mockConvertHTML.mockReturnValue('<p>HTML content</p>');
  mockReadingTime.mockReturnValue(3);
  mockScanImages.mockReturnValue([]);
  mockReplaceImages.mockImplementation((body: string) => body);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function cf(slug: string, lang: 'en' | 'pl' = 'en') {
  return { slug, lang };
}

// ── Full flow ─────────────────────────────────────────────────────────────────

describe('publish — full flow', () => {
  it('creates a new English post when en.md is added', async () => {
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'en')]);

    await main();

    expect(mockClient.createPost).toHaveBeenCalledOnce();
    const payload = mockClient.createPost.mock.calls[0][0];
    expect(payload.lang).toBe('en');
    expect(payload.slug).toBe('signals-in-angular');
  });

  it('creates a new Polish post when pl.md is added', async () => {
    const plFm = { ...VALID_FM };
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'pl')]);
    mockMatter.mockReturnValue({ data: plFm, content: 'Polish body', orig: '', language: '', matter: '', stringify: () => '' } as unknown as ReturnType<typeof matter>);
    mockValidate.mockReturnValue({ errors: [], frontmatter: plFm });

    await main();

    const payload = mockClient.createPost.mock.calls[0][0];
    expect(payload.lang).toBe('pl');
  });

  it('creates two posts for a new bilingual folder', async () => {
    mockDetectChanged.mockReturnValue([
      cf('signals-in-angular', 'en'),
      cf('signals-in-angular', 'pl'),
    ]);

    await main();

    expect(mockClient.createPost).toHaveBeenCalledTimes(2);
    const langs = mockClient.createPost.mock.calls.map((c) => c[0].lang);
    expect(langs).toContain('en');
    expect(langs).toContain('pl');
  });

  it('updates an existing post when it already exists in WordPress', async () => {
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'en')]);
    mockClient.findPostBySlug.mockResolvedValue({ id: 99 });

    await main();

    expect(mockClient.updatePost).toHaveBeenCalledWith(99, expect.any(Object));
    expect(mockClient.createPost).not.toHaveBeenCalled();
  });

  it('passes all resolved IDs to the WP payload', async () => {
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'en')]);
    mockClient.resolveAuthor.mockResolvedValue(7);
    mockClient.resolveCategory.mockResolvedValue(13);
    mockClient.resolveTag.mockResolvedValue(21);

    await main();

    const payload = mockClient.createPost.mock.calls[0][0];
    expect(payload.author).toBe(7);
    expect(payload.categories).toContain(13);
    expect(payload.tags).toContain(21);
  });

  it('resolves all tags via Promise.all', async () => {
    const fm = { ...VALID_FM, tags: ['signals', 'angular', 'rxjs'] };
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'en')]);
    mockMatter.mockReturnValue({ data: fm, content: 'body', orig: '', language: '', matter: '', stringify: () => '' } as unknown as ReturnType<typeof matter>);
    mockValidate.mockReturnValue({ errors: [], frontmatter: fm });
    mockClient.resolveTag
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    await main();

    expect(mockClient.resolveTag).toHaveBeenCalledTimes(3);
    const payload = mockClient.createPost.mock.calls[0][0];
    expect(payload.tags).toEqual([1, 2, 3]);
  });

  it('uploads cover image and sets featured_media in payload', async () => {
    const fm = { ...VALID_FM, coverImage: './assets/cover.png' };
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'en')]);
    mockMatter.mockReturnValue({ data: fm, content: 'body', orig: '', language: '', matter: '', stringify: () => '' } as unknown as ReturnType<typeof matter>);
    mockValidate.mockReturnValue({ errors: [], frontmatter: fm });
    mockClient.uploadMedia.mockResolvedValue({ id: 55, source_url: 'https://test.wp.com/cover.png' });

    await main();

    expect(mockClient.uploadMedia).toHaveBeenCalled();
    const payload = mockClient.createPost.mock.calls[0][0];
    expect(payload.featured_media).toBe(55);
  });

  it('does nothing when no files changed', async () => {
    mockDetectChanged.mockReturnValue([]);

    await main();

    expect(mockClient.createPost).not.toHaveBeenCalled();
    expect(mockClient.updatePost).not.toHaveBeenCalled();
  });

  it('includes reading time and difficulty in meta', async () => {
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'en')]);
    mockReadingTime.mockReturnValue(5);

    await main();

    const payload = mockClient.createPost.mock.calls[0][0];
    expect(payload.meta?.reading_time).toBe(5);
    expect(payload.meta?.difficulty).toBe(VALID_FM.difficulty);
  });

  it('passes lang to findPostBySlug for correct Polylang lookup', async () => {
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'en')]);

    await main();

    expect(mockClient.findPostBySlug).toHaveBeenCalledWith('signals-in-angular', 'en');
  });
});

// ── Soft delete ───────────────────────────────────────────────────────────────

describe('publish — soft delete (status: trash)', () => {
  it('trashes the WP post when status is trash and post exists', async () => {
    const fm = { ...VALID_FM, status: 'trash' as const };
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'en')]);
    mockMatter.mockReturnValue({ data: fm, content: '', orig: '', language: '', matter: '', stringify: () => '' } as unknown as ReturnType<typeof matter>);
    mockValidate.mockReturnValue({ errors: [], frontmatter: fm });
    mockClient.findPostBySlug.mockResolvedValue({ id: 88 });

    await main();

    expect(mockClient.trashPost).toHaveBeenCalledWith(88);
    expect(mockClient.createPost).not.toHaveBeenCalled();
  });

  it('skips trashing when status is trash but post not in WP', async () => {
    const fm = { ...VALID_FM, status: 'trash' as const };
    mockDetectChanged.mockReturnValue([cf('signals-in-angular', 'en')]);
    mockMatter.mockReturnValue({ data: fm, content: '', orig: '', language: '', matter: '', stringify: () => '' } as unknown as ReturnType<typeof matter>);
    mockValidate.mockReturnValue({ errors: [], frontmatter: fm });
    mockClient.findPostBySlug.mockResolvedValue(null);

    await main();

    expect(mockClient.trashPost).not.toHaveBeenCalled();
  });
});

// ── Deleted files ─────────────────────────────────────────────────────────────

describe('publish — deleted files', () => {
  it('trashes WP post when a language file is deleted', async () => {
    mockDetectDeleted.mockReturnValue([cf('old-post', 'en')]);
    mockClient.findPostBySlug.mockResolvedValue({ id: 77 });

    await main();

    expect(mockClient.trashPost).toHaveBeenCalledWith(77);
  });

  it('passes lang to findPostBySlug for deleted files', async () => {
    mockDetectDeleted.mockReturnValue([cf('old-post', 'pl')]);
    mockClient.findPostBySlug.mockResolvedValue(null);

    await main();

    expect(mockClient.findPostBySlug).toHaveBeenCalledWith('old-post', 'pl');
  });
});

// ── Validation failure ────────────────────────────────────────────────────────

describe('publish — validation failure', () => {
  it('calls process.exit(1) and makes no API calls when validation fails', async () => {
    mockDetectChanged.mockReturnValue([cf('bad-post', 'en')]);
    mockValidate.mockReturnValue({ errors: ['[bad-post/en.md] slug is required'] });

    await expect(main()).rejects.toThrow('process.exit called');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(mockClient.createPost).not.toHaveBeenCalled();
  });

  it('collects errors from all posts before exiting', async () => {
    mockDetectChanged.mockReturnValue([cf('post-a', 'en'), cf('post-b', 'en')]);
    mockValidate
      .mockReturnValueOnce({ errors: ['[post-a/en.md] slug mismatch'] })
      .mockReturnValueOnce({ errors: ['[post-b/en.md] invalid status'] });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(main()).rejects.toThrow('process.exit called');

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('post-a');
    expect(allOutput).toContain('post-b');
  });
});

// ── Error resilience ──────────────────────────────────────────────────────────

describe('publish — error resilience', () => {
  it('continues processing remaining posts when one fails', async () => {
    mockDetectChanged.mockReturnValue([cf('failing-post', 'en'), cf('good-post', 'en')]);

    let callCount = 0;
    mockClient.resolveAuthor.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('Author not found'));
      return Promise.resolve(1);
    });

    // main() exits with code 1 because there's a failure
    await expect(main()).rejects.toThrow('process.exit called');

    // good-post was still processed despite failing-post erroring
    expect(mockClient.createPost).toHaveBeenCalledOnce();
    expect(mockClient.createPost.mock.calls[0][0].slug).toBe('good-post');
  });

  it('uploads images once for a folder even if both en and pl change', async () => {
    mockDetectChanged.mockReturnValue([cf('bilingual-post', 'en'), cf('bilingual-post', 'pl')]);
    mockScanImages.mockReturnValue(['./assets/diagram.svg']);

    await main();

    // Image deduplication: shared assets/ — uploadMedia called once
    expect(mockClient.uploadMedia).toHaveBeenCalledOnce();
    // But both language posts are created
    expect(mockClient.createPost).toHaveBeenCalledTimes(2);
  });

  it('same author across multiple posts — resolveAuthor called per post', async () => {
    mockDetectChanged.mockReturnValue([cf('post-1', 'en'), cf('post-2', 'en')]);

    await main();

    // Each post resolves its author (client-level caching is not in publish.ts)
    expect(mockClient.resolveAuthor).toHaveBeenCalledTimes(2);
  });
});
