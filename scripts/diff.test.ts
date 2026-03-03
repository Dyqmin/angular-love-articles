import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));

import { execSync } from 'node:child_process';
import { detectChangedFiles, detectDeletedFiles } from './diff.js';

const mockExecSync = vi.mocked(execSync);

beforeEach(() => {
  mockExecSync.mockReset();
});

// ── detectChangedFiles ────────────────────────────────────────────────────────

describe('detectChangedFiles', () => {
  it('returns empty array when no post files changed', () => {
    mockExecSync.mockReturnValue('README.md\npackage.json\n');
    expect(detectChangedFiles()).toEqual([]);
  });

  it('detects a single changed en.md', () => {
    mockExecSync.mockReturnValue('posts/signals-in-angular/en.md\n');
    expect(detectChangedFiles()).toEqual([{ slug: 'signals-in-angular', lang: 'en' }]);
  });

  it('detects a single changed pl.md', () => {
    mockExecSync.mockReturnValue('posts/signals-in-angular/pl.md\n');
    expect(detectChangedFiles()).toEqual([{ slug: 'signals-in-angular', lang: 'pl' }]);
  });

  it('detects both en.md and pl.md changed in the same folder', () => {
    mockExecSync.mockReturnValue(
      'posts/signals-in-angular/en.md\nposts/signals-in-angular/pl.md\n',
    );
    const result = detectChangedFiles();
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ slug: 'signals-in-angular', lang: 'en' });
    expect(result).toContainEqual({ slug: 'signals-in-angular', lang: 'pl' });
  });

  it('detects changes in multiple different folders', () => {
    mockExecSync.mockReturnValue(
      'posts/post-one/en.md\nposts/post-two/pl.md\nposts/post-three/en.md\n',
    );
    const result = detectChangedFiles();
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ slug: 'post-one', lang: 'en' });
    expect(result).toContainEqual({ slug: 'post-two', lang: 'pl' });
    expect(result).toContainEqual({ slug: 'post-three', lang: 'en' });
  });

  it('ignores non-post files (README, package.json)', () => {
    mockExecSync.mockReturnValue(
      'README.md\npackage.json\nposts/my-post/en.md\n.github/workflows/publish.yaml\n',
    );
    expect(detectChangedFiles()).toEqual([{ slug: 'my-post', lang: 'en' }]);
  });

  it('ignores asset files inside post folders', () => {
    mockExecSync.mockReturnValue(
      'posts/my-post/assets/diagram.svg\nposts/my-post/en.md\n',
    );
    expect(detectChangedFiles()).toEqual([{ slug: 'my-post', lang: 'en' }]);
  });

  it('ignores files with non-matching names (index.md, README.md inside posts)', () => {
    mockExecSync.mockReturnValue(
      'posts/my-post/index.md\nposts/my-post/README.md\n',
    );
    expect(detectChangedFiles()).toEqual([]);
  });

  it('handles empty git diff output', () => {
    mockExecSync.mockReturnValue('');
    expect(detectChangedFiles()).toEqual([]);
  });

  it('falls back to git ls-files on first commit (no HEAD~1)', () => {
    mockExecSync
      .mockImplementationOnce(() => { throw new Error('fatal: ambiguous argument HEAD~1'); })
      .mockReturnValueOnce('posts/first-post/en.md\nposts/first-post/pl.md\n');

    const result = detectChangedFiles();
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ slug: 'first-post', lang: 'en' });
    expect(result).toContainEqual({ slug: 'first-post', lang: 'pl' });
  });

  it('uses correct git diff command with AM filter', () => {
    mockExecSync.mockReturnValue('');
    detectChangedFiles();
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('--diff-filter=AM'),
      expect.any(Object),
    );
  });

  it('renamed folder: old path deleted treated separately from new path added', () => {
    // Simulate rename: old path shows as D, new path as A — AM filter picks up the addition
    mockExecSync.mockReturnValue('posts/new-slug/en.md\n');
    const result = detectChangedFiles();
    expect(result).toEqual([{ slug: 'new-slug', lang: 'en' }]);
  });
});

// ── detectDeletedFiles ────────────────────────────────────────────────────────

describe('detectDeletedFiles', () => {
  it('returns empty array when no post files deleted', () => {
    mockExecSync.mockReturnValue('README.md\n');
    expect(detectDeletedFiles()).toEqual([]);
  });

  it('detects a deleted en.md', () => {
    mockExecSync.mockReturnValue('posts/old-post/en.md\n');
    expect(detectDeletedFiles()).toEqual([{ slug: 'old-post', lang: 'en' }]);
  });

  it('detects a deleted pl.md', () => {
    mockExecSync.mockReturnValue('posts/old-post/pl.md\n');
    expect(detectDeletedFiles()).toEqual([{ slug: 'old-post', lang: 'pl' }]);
  });

  it('detects both language files deleted (folder removed)', () => {
    mockExecSync.mockReturnValue('posts/old-post/en.md\nposts/old-post/pl.md\n');
    const result = detectDeletedFiles();
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ slug: 'old-post', lang: 'en' });
    expect(result).toContainEqual({ slug: 'old-post', lang: 'pl' });
  });

  it('returns empty array on first commit (no HEAD~1)', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('fatal: ambiguous argument HEAD~1');
    });
    expect(detectDeletedFiles()).toEqual([]);
  });

  it('uses correct git diff command with D filter', () => {
    mockExecSync.mockReturnValue('');
    detectDeletedFiles();
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('--diff-filter=D'),
      expect.any(Object),
    );
  });

  it('handles mix of additions and deletions — only deletions returned', () => {
    // This function only calls the D filter, so additions are not in the output anyway
    mockExecSync.mockReturnValue('posts/deleted-post/en.md\n');
    const result = detectDeletedFiles();
    expect(result).toEqual([{ slug: 'deleted-post', lang: 'en' }]);
  });
});
