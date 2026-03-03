import { describe, it, expect } from 'vitest';
import { scanMarkdownImages, replaceImagePaths } from './images.js';

// ── scanMarkdownImages ────────────────────────────────────────────────────────

describe('scanMarkdownImages', () => {
  it('returns empty array for body with no images', () => {
    expect(scanMarkdownImages('Just some text with no images.')).toEqual([]);
  });

  it('returns empty array for empty body', () => {
    expect(scanMarkdownImages('')).toEqual([]);
  });

  it('detects a single local image', () => {
    const body = '![Architecture overview](./assets/diagram.svg)';
    expect(scanMarkdownImages(body)).toEqual(['./assets/diagram.svg']);
  });

  it('detects multiple different images', () => {
    const body = [
      '![Cover](./assets/cover.png)',
      '![Diagram](./assets/diagram.svg)',
      '![Screenshot](./assets/screenshot.jpg)',
    ].join('\n');
    const result = scanMarkdownImages(body);
    expect(result).toHaveLength(3);
    expect(result).toContain('./assets/cover.png');
    expect(result).toContain('./assets/diagram.svg');
    expect(result).toContain('./assets/screenshot.jpg');
  });

  it('deduplicates the same path used multiple times', () => {
    const body = [
      '![First use](./assets/diagram.svg)',
      'Some text in between.',
      '![Second use](./assets/diagram.svg)',
    ].join('\n');
    const result = scanMarkdownImages(body);
    expect(result).toHaveLength(1);
    expect(result).toEqual(['./assets/diagram.svg']);
  });

  it('ignores absolute HTTPS URLs', () => {
    const body = '![External](https://example.com/image.png)';
    expect(scanMarkdownImages(body)).toEqual([]);
  });

  it('ignores relative paths outside assets/ directory', () => {
    const body = '![Other](../other/image.png)';
    expect(scanMarkdownImages(body)).toEqual([]);
  });

  it('ignores paths without leading ./', () => {
    const body = '![No dot-slash](assets/image.png)';
    expect(scanMarkdownImages(body)).toEqual([]);
  });

  it('detects various supported image formats', () => {
    const body = [
      '![PNG](./assets/a.png)',
      '![JPG](./assets/b.jpg)',
      '![JPEG](./assets/c.jpeg)',
      '![GIF](./assets/d.gif)',
      '![WEBP](./assets/e.webp)',
      '![SVG](./assets/f.svg)',
    ].join('\n');
    const result = scanMarkdownImages(body);
    expect(result).toHaveLength(6);
  });

  it('handles empty alt text', () => {
    const body = '![](./assets/diagram.svg)';
    expect(scanMarkdownImages(body)).toEqual(['./assets/diagram.svg']);
  });

  it('is safe to call multiple times (stateless)', () => {
    const body = '![Img](./assets/image.png)';
    const first = scanMarkdownImages(body);
    const second = scanMarkdownImages(body);
    expect(first).toEqual(second);
  });
});

// ── replaceImagePaths ─────────────────────────────────────────────────────────

describe('replaceImagePaths', () => {
  it('replaces a known path with its WordPress URL', () => {
    const body = '![Diagram](./assets/diagram.svg)';
    const mapping = new Map([['./assets/diagram.svg', 'https://wp.example.com/media/diagram.svg']]);
    const result = replaceImagePaths(body, mapping);
    expect(result).toContain('https://wp.example.com/media/diagram.svg');
    expect(result).not.toContain('./assets/diagram.svg');
  });

  it('preserves the alt text after replacement', () => {
    const body = '![Architecture overview](./assets/diagram.svg)';
    const mapping = new Map([['./assets/diagram.svg', 'https://wp.example.com/diagram.svg']]);
    const result = replaceImagePaths(body, mapping);
    expect(result).toBe('![Architecture overview](https://wp.example.com/diagram.svg)');
  });

  it('leaves unknown paths unchanged', () => {
    const body = '![Unknown](./assets/unknown.png)';
    const mapping = new Map([['./assets/other.png', 'https://wp.example.com/other.png']]);
    const result = replaceImagePaths(body, mapping);
    expect(result).toBe(body);
  });

  it('replaces multiple paths in one call', () => {
    const body = '![A](./assets/a.png)\n![B](./assets/b.png)';
    const mapping = new Map([
      ['./assets/a.png', 'https://wp.example.com/a.png'],
      ['./assets/b.png', 'https://wp.example.com/b.png'],
    ]);
    const result = replaceImagePaths(body, mapping);
    expect(result).toContain('https://wp.example.com/a.png');
    expect(result).toContain('https://wp.example.com/b.png');
    expect(result).not.toContain('./assets/');
  });

  it('replaces all occurrences of the same path', () => {
    const body = '![A](./assets/img.png)\n![B](./assets/img.png)';
    const mapping = new Map([['./assets/img.png', 'https://wp.example.com/img.png']]);
    const result = replaceImagePaths(body, mapping);
    expect(result.match(/https:\/\/wp\.example\.com\/img\.png/g)).toHaveLength(2);
    expect(result).not.toContain('./assets/img.png');
  });

  it('returns body unchanged when mapping is empty', () => {
    const body = '![Diagram](./assets/diagram.svg)';
    expect(replaceImagePaths(body, new Map())).toBe(body);
  });

  it('does not affect non-image markdown', () => {
    const body = 'Some **bold** text and `inline code`.\n![Img](./assets/img.png)';
    const mapping = new Map([['./assets/img.png', 'https://wp.example.com/img.png']]);
    const result = replaceImagePaths(body, mapping);
    expect(result).toContain('**bold**');
    expect(result).toContain('`inline code`');
  });

  it('does not touch absolute URLs in image syntax', () => {
    const body = '![External](https://example.com/img.png)';
    const mapping = new Map([['https://example.com/img.png', 'https://other.com/img.png']]);
    // The regex only matches ./assets/ paths, so absolute URL stays unchanged
    const result = replaceImagePaths(body, mapping);
    expect(result).toBe(body);
  });

  it('is safe to call multiple times (idempotent for wp URLs)', () => {
    const body = '![Img](./assets/img.png)';
    const mapping = new Map([['./assets/img.png', 'https://wp.example.com/img.png']]);
    const first = replaceImagePaths(body, mapping);
    // Calling again with the same input should produce the same result
    const second = replaceImagePaths(body, mapping);
    expect(first).toBe(second);
  });
});
