// Load .env for local development (silent no-op in CI where the file doesn't exist)
try { process.loadEnvFile(); } catch { /* not present — rely on real env vars */ }

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import matter from 'gray-matter';
import { detectChangedPosts, detectDeletedPosts } from './diff.js';
import { convertMarkdownToHTML, calculateReadingTime } from './markdown.js';
import { scanMarkdownImages, replaceImagePaths } from './images.js';
import { WordPressClient } from './wordpress.js';
import type { PostFrontmatter, PublishResult, WordPressPayload } from './types.js';

// ── Environment validation ────────────────────────────────────────────────────

const WP_URL = process.env['WP_URL'];
const WP_AUTH_USER = process.env['WP_AUTH_USER'];
const WP_AUTH_PASSWORD = process.env['WP_AUTH_PASSWORD'];

if (!WP_URL || !WP_AUTH_USER || !WP_AUTH_PASSWORD) {
  console.error('Missing required environment variables: WP_URL, WP_AUTH_USER, WP_AUTH_PASSWORD');
  process.exit(1);
}

// ── Frontmatter validation ────────────────────────────────────────────────────

const VALID_STATUSES = new Set(['draft', 'publish', 'trash']);
const VALID_DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFrontmatter(fm: unknown, slug: string): PostFrontmatter {
  const f = fm as Record<string, unknown>;

  const required = ['title', 'slug', 'author', 'date', 'category', 'tags', 'status', 'difficulty', 'excerpt'];
  for (const field of required) {
    if (f[field] === undefined || f[field] === null || f[field] === '') {
      throw new Error(`Missing required frontmatter field: ${field}`);
    }
  }

  if (!VALID_STATUSES.has(f['status'] as string)) {
    throw new Error(`Invalid status "${f['status']}" — must be one of: draft, publish, trash`);
  }
  if (!VALID_DIFFICULTIES.has(f['difficulty'] as string)) {
    throw new Error(`Invalid difficulty "${f['difficulty']}" — must be one of: beginner, intermediate, advanced`);
  }
  if (!EMAIL_RE.test(f['author'] as string)) {
    throw new Error(`Invalid author email: "${f['author']}"`);
  }
  if (!Array.isArray(f['tags'])) {
    throw new Error('frontmatter "tags" must be an array');
  }
  if (f['slug'] !== slug) {
    console.warn(`⚠  Frontmatter slug "${f['slug']}" differs from folder name "${slug}" — using folder name`);
  }

  return f as unknown as PostFrontmatter;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = new WordPressClient({
    url: WP_URL!,
    user: WP_AUTH_USER!,
    password: WP_AUTH_PASSWORD!,
  });

  const results: PublishResult[] = [];

  // Detect changes
  const changedSlugs = detectChangedPosts();
  const deletedSlugs = detectDeletedPosts();

  console.log(`Changed posts:  ${changedSlugs.join(', ') || '(none)'}`);
  console.log(`Deleted posts:  ${deletedSlugs.join(', ') || '(none)'}`);

  // ── Handle file deletions ────────────────────────────────────────────────
  for (const slug of deletedSlugs) {
    console.warn(`⚠  Post folder deleted for "${slug}". Prefer setting status: trash in frontmatter instead.`);
    try {
      const existing = await client.findPostBySlug(slug);
      if (existing) {
        await client.trashPost(existing.id);
        console.log(`  Trashed post: ${slug} (id=${existing.id})`);
        results.push({ slug, action: 'trashed', postId: existing.id });
      } else {
        console.log(`  No WP post found for deleted slug: ${slug}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Error trashing ${slug}: ${message}`);
      results.push({ slug, action: 'error', error: message });
    }
  }

  // ── Handle changed posts ─────────────────────────────────────────────────
  for (const slug of changedSlugs) {
    try {
      const postDir = resolve(`posts/${slug}`);
      const indexPath = join(postDir, 'index.md');

      if (!existsSync(indexPath)) {
        throw new Error(`index.md not found for slug "${slug}" at ${indexPath}`);
      }

      const raw = readFileSync(indexPath, 'utf8');
      const { data, content: rawBody } = matter(raw);
      const fm = validateFrontmatter(data, slug);

      // ── Status: trash → soft-delete ──────────────────────────────────────
      if (fm.status === 'trash') {
        const existing = await client.findPostBySlug(slug);
        if (existing) {
          await client.trashPost(existing.id);
          console.log(`  Trashed post: ${slug} (id=${existing.id})`);
          results.push({ slug, action: 'trashed', postId: existing.id });
        } else {
          console.log(`  Post "${slug}" is marked trash but not found in WP — skipping`);
        }
        continue;
      }

      // ── Resolve author ───────────────────────────────────────────────────
      const authorId = await client.resolveAuthor(fm.author);

      // ── Resolve category ─────────────────────────────────────────────────
      const categoryId = await client.resolveCategory(fm.category);

      // ── Resolve tags ─────────────────────────────────────────────────────
      const tagIds = await Promise.all(fm.tags.map((tag) => client.resolveTag(tag)));

      // ── Upload cover image ───────────────────────────────────────────────
      let featuredMediaId: number | undefined;
      if (fm.coverImage) {
        const coverPath = resolve(join(postDir, fm.coverImage.replace(/^\.\//, '')));
        if (existsSync(coverPath)) {
          const media = await client.uploadMedia(coverPath);
          featuredMediaId = media.id;
          console.log(`  Uploaded cover image: ${media.source_url}`);
        } else {
          console.warn(`  ⚠  Cover image not found: ${coverPath}`);
        }
      }

      // ── Upload inline images ─────────────────────────────────────────────
      const inlineImagePaths = scanMarkdownImages(rawBody);
      const imageMapping = new Map<string, string>();

      for (const relPath of inlineImagePaths) {
        const absPath = resolve(join(postDir, relPath.replace(/^\.\//, '')));
        if (existsSync(absPath)) {
          const media = await client.uploadMedia(absPath);
          imageMapping.set(relPath, media.source_url);
          console.log(`  Uploaded inline image: ${media.source_url}`);
        } else {
          console.warn(`  ⚠  Inline image not found: ${absPath}`);
        }
      }

      // ── Process body ─────────────────────────────────────────────────────
      const readingTime = calculateReadingTime(rawBody); // use original body
      const processedBody = replaceImagePaths(rawBody, imageMapping);
      const htmlContent = convertMarkdownToHTML(processedBody);

      // ── Build payload ─────────────────────────────────────────────────────
      const payload: WordPressPayload = {
        title: fm.title,
        slug: slug,
        content: htmlContent,
        excerpt: fm.excerpt,
        status: fm.status, // 'draft' | 'publish'
        author: authorId,
        categories: [categoryId],
        tags: tagIds,
        date: fm.date,
        meta: {
          reading_time: readingTime,
          difficulty: fm.difficulty,
        },
        ...(featuredMediaId !== undefined && { featured_media: featuredMediaId }),
      };

      // ── Create or update ─────────────────────────────────────────────────
      const existing = await client.findPostBySlug(slug);

      if (existing) {
        const id = await client.updatePost(existing.id, payload);
        console.log(`  Updated post: ${slug} (id=${id})`);
        results.push({ slug, action: 'updated', postId: id });
      } else {
        const id = await client.createPost(payload);
        console.log(`  Created post: ${slug} (id=${id})`);
        results.push({ slug, action: 'created', postId: id });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Error processing "${slug}": ${message}`);
      results.push({ slug, action: 'error', error: message });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const created = results.filter((r) => r.action === 'created').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const trashed = results.filter((r) => r.action === 'trashed').length;
  const errors  = results.filter((r) => r.action === 'error');

  console.log('\n── Publish summary ──────────────────────────────');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Trashed: ${trashed}`);
  console.log(`  Errors:  ${errors.length}`);

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`  ✗ ${e.slug}: ${e.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected fatal error:', err);
  process.exit(1);
});
