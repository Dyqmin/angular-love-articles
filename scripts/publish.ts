// Load .env for local development (silent no-op in CI where the file doesn't exist)
try { process.loadEnvFile(); } catch { /* not present — rely on real env vars */ }

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { detectChangedFiles, detectDeletedFiles } from './diff.js';
import { validateFrontmatter } from './validation.js';
import { convertMarkdownToHTML, calculateReadingTime } from './markdown.js';
import { scanMarkdownImages, replaceImagePaths } from './images.js';
import { WordPressClient } from './wordpress.js';
import type { ChangedFile, PublishResult, WordPressPayload } from './types.js';

// ── Environment validation ────────────────────────────────────────────────────

const WP_URL = process.env['WP_URL'];
const WP_AUTH_USER = process.env['WP_AUTH_USER'];
const WP_AUTH_PASSWORD = process.env['WP_AUTH_PASSWORD'];

if (!WP_URL || !WP_AUTH_USER || !WP_AUTH_PASSWORD) {
  console.error('Missing required environment variables: WP_URL, WP_AUTH_USER, WP_AUTH_PASSWORD');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupBySlug(files: ChangedFile[]): Map<string, ('en' | 'pl')[]> {
  const map = new Map<string, ('en' | 'pl')[]>();
  for (const { slug, lang } of files) {
    const langs = map.get(slug) ?? [];
    langs.push(lang);
    map.set(slug, langs);
  }
  return map;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = new WordPressClient({
    url: WP_URL!,
    user: WP_AUTH_USER!,
    password: WP_AUTH_PASSWORD!,
  });

  const results: PublishResult[] = [];

  // ── Step 1: Detect changes ───────────────────────────────────────────────
  const changedFiles = detectChangedFiles();
  const deletedFiles = detectDeletedFiles();

  const changedBySlugs = groupBySlug(changedFiles);
  const deletedBySlugs = groupBySlug(deletedFiles);

  console.log(
    `Changed files:  ${changedFiles.map((f) => `${f.slug}/${f.lang}.md`).join(', ') || '(none)'}`,
  );
  console.log(
    `Deleted files:  ${deletedFiles.map((f) => `${f.slug}/${f.lang}.md`).join(', ') || '(none)'}`,
  );

  // ── Step 2: Validate all changed posts up front ───────────────────────────
  const allValidationErrors: string[] = [];
  // Cache parsed frontmatter to avoid double-reading files
  const parsedCache = new Map<string, { data: unknown; content: string }>();

  for (const [slug, langs] of changedBySlugs) {
    const postDir = resolve(`posts/${slug}`);
    const slugsInFolder: string[] = [];

    for (const lang of langs) {
      const filePath = `posts/${slug}/${lang}.md`;
      const absPath = join(postDir, `${lang}.md`);

      if (!existsSync(absPath)) {
        allValidationErrors.push(`[${filePath}] file not found on disk`);
        continue;
      }

      const raw = readFileSync(absPath, 'utf8');
      const { data, content } = matter(raw);
      parsedCache.set(filePath, { data, content });

      const { errors } = validateFrontmatter(data, slug, filePath);
      allValidationErrors.push(...errors);

      const fm = data as Record<string, unknown>;
      if (typeof fm['slug'] === 'string') slugsInFolder.push(fm['slug']);
    }

    // Slug consistency — both language files in the same folder must share the same slug
    if (slugsInFolder.length === 2 && slugsInFolder[0] !== slugsInFolder[1]) {
      allValidationErrors.push(
        `[posts/${slug}/] en.md and pl.md have different slug values: ` +
          `"${slugsInFolder[0]}" vs "${slugsInFolder[1]}"`,
      );
    }
  }

  if (allValidationErrors.length > 0) {
    console.error('\nValidation failed — fix the errors below before publishing:\n');
    for (const err of allValidationErrors) {
      console.error(`  ✗ ${err}`);
    }
    process.exit(1);
  }

  // ── Step 3: Handle deleted language files ────────────────────────────────
  for (const [slug, langs] of deletedBySlugs) {
    console.warn(
      `⚠  Deleted: posts/${slug}/ (${langs.join(', ')}). ` +
        `Prefer setting status: trash in frontmatter instead.`,
    );
    for (const lang of langs) {
      try {
        const existing = await client.findPostBySlug(slug, lang);
        if (existing) {
          await client.trashPost(existing.id);
          console.log(`  Trashed ${lang} post: ${slug} (id=${existing.id})`);
          results.push({ slug, lang, action: 'trashed', postId: existing.id });
        } else {
          console.log(`  No WP post found for deleted ${slug}/${lang}.md`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Error trashing ${slug}/${lang}: ${message}`);
        results.push({ slug, lang, action: 'error', error: message });
      }
    }
  }

  // ── Step 4: Process changed posts ────────────────────────────────────────
  for (const [slug, langs] of changedBySlugs) {
    const postDir = resolve(`posts/${slug}`);

    // Upload images once per folder — shared across all language files
    const imageMapping = new Map<string, string>();
    const allInlinePaths = new Set<string>();

    for (const lang of langs) {
      const filePath = `posts/${slug}/${lang}.md`;
      const cached = parsedCache.get(filePath);
      if (cached) {
        for (const p of scanMarkdownImages(cached.content)) allInlinePaths.add(p);
      }
    }

    for (const relPath of allInlinePaths) {
      const absPath = resolve(join(postDir, relPath.replace(/^\.\//, '')));
      if (existsSync(absPath)) {
        try {
          const media = await client.uploadMedia(absPath);
          imageMapping.set(relPath, media.source_url);
          console.log(`  [${slug}] Uploaded image: ${media.source_url}`);
        } catch (err) {
          console.warn(`  ⚠  [${slug}] Failed to upload ${relPath}: ${(err as Error).message}`);
        }
      } else {
        console.warn(`  ⚠  [${slug}] Inline image not found: ${absPath}`);
      }
    }

    // Process each language file independently
    for (const lang of langs) {
      const filePath = `posts/${slug}/${lang}.md`;
      try {
        const cached = parsedCache.get(filePath)!;
        // validateFrontmatter already passed — cast is safe
        const { frontmatter: fm } = validateFrontmatter(cached.data, slug, filePath);
        if (!fm) throw new Error('Unexpected validation miss');

        // ── Trash ────────────────────────────────────────────────────────────
        if (fm.status === 'trash') {
          const existing = await client.findPostBySlug(slug, lang);
          if (existing) {
            await client.trashPost(existing.id);
            console.log(`  Trashed ${lang} post: ${slug} (id=${existing.id})`);
            results.push({ slug, lang, action: 'trashed', postId: existing.id });
          } else {
            console.log(`  ${lang} post "${slug}" marked trash but not in WP — skipping`);
          }
          continue;
        }

        // ── Resolve WP objects ───────────────────────────────────────────────
        const authorId = await client.resolveAuthor(fm.author);
        const categoryId = await client.resolveCategory(fm.category);
        const tagIds = await Promise.all(fm.tags.map((tag) => client.resolveTag(tag)));

        // ── Cover image ──────────────────────────────────────────────────────
        let featuredMediaId: number | undefined;
        if (fm.coverImage) {
          const coverPath = resolve(join(postDir, fm.coverImage.replace(/^\.\//, '')));
          if (existsSync(coverPath)) {
            const media = await client.uploadMedia(coverPath);
            featuredMediaId = media.id;
            console.log(`  [${slug}/${lang}] Uploaded cover: ${media.source_url}`);
          } else {
            console.warn(`  ⚠  [${slug}/${lang}] Cover image not found: ${coverPath}`);
          }
        }

        // ── Build content ────────────────────────────────────────────────────
        const rawBody = cached.content;
        const readingTime = calculateReadingTime(rawBody);
        const processedBody = replaceImagePaths(rawBody, imageMapping);
        const htmlContent = convertMarkdownToHTML(processedBody);

        // ── Payload ──────────────────────────────────────────────────────────
        const payload: WordPressPayload = {
          title: fm.title,
          slug,
          content: htmlContent,
          excerpt: fm.excerpt,
          status: fm.status,
          author: authorId,
          categories: [categoryId],
          tags: tagIds,
          date: fm.date,
          lang,
          meta: {
            reading_time: readingTime,
            difficulty: fm.difficulty,
          },
          ...(featuredMediaId !== undefined && { featured_media: featuredMediaId }),
        };

        // ── Create or update ─────────────────────────────────────────────────
        const existing = await client.findPostBySlug(slug, lang);
        if (existing) {
          const id = await client.updatePost(existing.id, payload);
          console.log(`  Updated ${lang} post: ${slug} (id=${id})`);
          results.push({ slug, lang, action: 'updated', postId: id });
        } else {
          const id = await client.createPost(payload);
          console.log(`  Created ${lang} post: ${slug} (id=${id})`);
          results.push({ slug, lang, action: 'created', postId: id });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Error processing ${slug}/${lang}.md: ${message}`);
        results.push({ slug, lang, action: 'error', error: message });
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
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
      console.error(`  ✗ ${e.slug}/${e.lang}: ${e.error}`);
    }
    process.exit(1);
  }
}

export { main };

// Run only when executed directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Unexpected fatal error:', err);
    process.exit(1);
  });
}
