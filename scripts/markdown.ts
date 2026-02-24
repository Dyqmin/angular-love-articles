import { marked } from 'marked';

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      return lang
        ? `<pre><code class="language-${lang}">${escaped}</code></pre>\n`
        : `<pre><code>${escaped}</code></pre>\n`;
    },
  },
});

export function convertMarkdownToHTML(body: string): string {
  return marked(body) as string;
}

export function calculateReadingTime(body: string): number {
  const stripped = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '');
  const words = stripped.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 200);
}
