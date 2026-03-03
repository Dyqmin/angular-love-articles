import { execSync } from 'node:child_process';
import type { ChangedFile } from './types.js';

function extractChangedFiles(output: string): ChangedFile[] {
  const results: ChangedFile[] = [];
  for (const line of output.split('\n')) {
    const match = /^posts\/([^/]+)\/(en|pl)\.md$/.exec(line.trim());
    if (match) {
      results.push({ slug: match[1], lang: match[2] as 'en' | 'pl' });
    }
  }
  return results;
}

export function detectChangedFiles(): ChangedFile[] {
  try {
    const output = execSync('git diff HEAD~1 HEAD --name-only --diff-filter=AM', {
      encoding: 'utf8',
    });
    return extractChangedFiles(output);
  } catch {
    // First commit — HEAD~1 doesn't exist; fall back to all tracked post files
    const output = execSync('git ls-files "posts/*/en.md" "posts/*/pl.md"', { encoding: 'utf8' });
    return extractChangedFiles(output);
  }
}

export function detectDeletedFiles(): ChangedFile[] {
  try {
    const output = execSync('git diff HEAD~1 HEAD --name-only --diff-filter=D', {
      encoding: 'utf8',
    });
    return extractChangedFiles(output);
  } catch {
    return [];
  }
}
