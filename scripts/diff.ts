import { execSync } from 'node:child_process';

function extractSlugs(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^posts\/[^/]+\/index\.md$/.test(line))
    .map((line) => line.split('/')[1]);
}

export function detectChangedPosts(): string[] {
  try {
    const output = execSync('git diff HEAD~1 HEAD --name-only --diff-filter=AM', {
      encoding: 'utf8',
    });
    return extractSlugs(output);
  } catch {
    // First commit — HEAD~1 doesn't exist; fall back to all tracked post files
    const output = execSync('git ls-files posts/*/index.md', { encoding: 'utf8' });
    return extractSlugs(output);
  }
}

export function detectDeletedPosts(): string[] {
  try {
    const output = execSync('git diff HEAD~1 HEAD --name-only --diff-filter=D', {
      encoding: 'utf8',
    });
    return extractSlugs(output);
  } catch {
    // First commit — nothing deleted yet
    return [];
  }
}
