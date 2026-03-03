import { describe, it, expect } from 'vitest';
import { convertMarkdownToHTML, calculateReadingTime } from './markdown.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

// ── convertMarkdownToHTML ─────────────────────────────────────────────────────

describe('convertMarkdownToHTML', () => {
  describe('code blocks', () => {
    it.each([
      'typescript',
      'html',
      'css',
      'javascript',
      'shell',
      'bash',
      'json',
      'yaml',
    ])('renders fenced block with language "%s" using correct class', (lang) => {
      const html = convertMarkdownToHTML(`\`\`\`${lang}\nconst x = 1;\n\`\`\``);
      expect(html).toContain(`class="language-${lang}"`);
      expect(html).toContain('<pre><code');
    });

    it('renders fenced block without language tag', () => {
      const html = convertMarkdownToHTML('```\nplain code\n```');
      expect(html).toContain('<pre><code>');
      expect(html).not.toContain('class="language-');
    });

    it('escapes & in code blocks', () => {
      const html = convertMarkdownToHTML('```typescript\na && b\n```');
      expect(html).toContain('&amp;&amp;');
      expect(html).not.toContain('&&');
    });

    it('escapes < in code blocks', () => {
      const html = convertMarkdownToHTML('```typescript\nconst x: Array<string> = [];\n```');
      expect(html).toContain('&lt;string&gt;');
      expect(html).not.toContain('<string>');
    });

    it('escapes > in code blocks', () => {
      const html = convertMarkdownToHTML('```html\n<div>text</div>\n```');
      expect(html).toContain('&lt;div&gt;');
    });

    it('escapes " in code blocks', () => {
      const html = convertMarkdownToHTML('```html\n<div class="foo">\n```');
      expect(html).toContain('&quot;');
    });

    it('handles multiple code blocks with different languages', () => {
      const md = [
        '```typescript',
        'const x = 1;',
        '```',
        '',
        '```html',
        '<div></div>',
        '```',
      ].join('\n');
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('class="language-typescript"');
      expect(html).toContain('class="language-html"');
    });

    it('does not render HTML inside code blocks', () => {
      const html = convertMarkdownToHTML('```\n<script>alert("xss")</script>\n```');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('renders inline code', () => {
      const html = convertMarkdownToHTML('Use `signal()` to create reactive state.');
      expect(html).toContain('<code>signal()</code>');
    });
  });

  describe('headings', () => {
    it.each([1, 2, 3, 4, 5, 6])('renders h%d', (level) => {
      const html = convertMarkdownToHTML(`${'#'.repeat(level)} Heading ${level}`);
      expect(html).toContain(`<h${level}`);
    });
  });

  describe('text formatting', () => {
    it('renders bold text', () => {
      const html = convertMarkdownToHTML('**bold text**');
      expect(html).toContain('<strong>bold text</strong>');
    });

    it('renders italic text', () => {
      const html = convertMarkdownToHTML('*italic text*');
      expect(html).toContain('<em>italic text</em>');
    });

    it('renders links', () => {
      const html = convertMarkdownToHTML('[Angular](https://angular.io)');
      expect(html).toContain('href="https://angular.io"');
      expect(html).toContain('>Angular<');
    });

    it('renders images with alt text', () => {
      const html = convertMarkdownToHTML('![A diagram](./assets/diagram.svg)');
      expect(html).toContain('<img');
      expect(html).toContain('alt="A diagram"');
    });
  });

  describe('lists', () => {
    it('renders unordered list', () => {
      const html = convertMarkdownToHTML('- item one\n- item two');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>');
    });

    it('renders ordered list', () => {
      const html = convertMarkdownToHTML('1. first\n2. second');
      expect(html).toContain('<ol>');
      expect(html).toContain('<li>');
    });
  });

  describe('blockquote', () => {
    it('renders blockquote', () => {
      const html = convertMarkdownToHTML('> This is a quote');
      expect(html).toContain('<blockquote>');
    });
  });

  describe('table', () => {
    it('renders a markdown table', () => {
      const md = '| A | B |\n|---|---|\n| 1 | 2 |';
      const html = convertMarkdownToHTML(md);
      expect(html).toContain('<table>');
      expect(html).toContain('<th>');
      expect(html).toContain('<td>');
    });
  });

  describe('horizontal rule', () => {
    it('renders horizontal rule', () => {
      const html = convertMarkdownToHTML('---');
      expect(html).toContain('<hr');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(convertMarkdownToHTML('')).toBe('');
    });

    it('handles Unicode correctly (Polish characters)', () => {
      const html = convertMarkdownToHTML('Sygnały w Angular: ą ę ó ś ł ż ź ć ń');
      expect(html).toContain('ą');
      expect(html).toContain('ę');
      expect(html).toContain('ł');
    });

    it('renders a large document without errors', () => {
      const md = Array.from({ length: 100 }, (_, i) => `## Section ${i}\n\n${words(50)}\n`).join('\n');
      expect(() => convertMarkdownToHTML(md)).not.toThrow();
    });

    it('handles mixed HTML and Markdown', () => {
      const html = convertMarkdownToHTML('Normal **markdown** and <em>raw HTML</em>.');
      expect(html).toContain('<strong>markdown</strong>');
    });
  });
});

// ── calculateReadingTime ──────────────────────────────────────────────────────

describe('calculateReadingTime', () => {
  it('returns 0 for empty body', () => {
    expect(calculateReadingTime('')).toBe(0);
  });

  it('returns 1 for exactly 200 words', () => {
    expect(calculateReadingTime(words(200))).toBe(1);
  });

  it('rounds up: 201 words → 2 minutes', () => {
    expect(calculateReadingTime(words(201))).toBe(2);
  });

  it('rounds up: 150 words → 1 minute', () => {
    expect(calculateReadingTime(words(150))).toBe(1);
  });

  it('returns 2 for exactly 400 words', () => {
    expect(calculateReadingTime(words(400))).toBe(2);
  });

  it('returns 1 for a single word', () => {
    expect(calculateReadingTime('hello')).toBe(1);
  });

  it('excludes fenced code block content from word count', () => {
    // 200 real words + large code block → should still be 1 minute (not more)
    const codeBlock = '```typescript\n' + words(500) + '\n```';
    const body = words(200) + '\n' + codeBlock;
    expect(calculateReadingTime(body)).toBe(1);
  });

  it('excludes inline code from word count', () => {
    // 200 words of prose but each word followed by inline code
    const body = Array.from({ length: 200 }, (_, i) => `word${i} \`code${i}\``).join(' ');
    // Without inline code = 200 words; with inline code = more, but code is stripped
    expect(calculateReadingTime(body)).toBe(1);
  });

  it('handles body containing only code blocks (returns 0 or 1)', () => {
    const body = '```typescript\n' + words(1000) + '\n```';
    // All content is in code block, stripped → 0 words → 0 minutes
    expect(calculateReadingTime(body)).toBe(0);
  });

  it('handles multiple code blocks', () => {
    const block = '```\n' + words(500) + '\n```';
    const body = words(400) + '\n' + block + '\n' + block;
    expect(calculateReadingTime(body)).toBe(2);
  });
});
