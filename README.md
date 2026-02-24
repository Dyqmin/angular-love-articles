# angular.love — Community Blog Articles

This repository is the source of truth for all articles published on
[angular.love](https://angular.love). Authors write posts in Markdown, collaborate
via GitHub Pull Requests, and posts are automatically published to WordPress when a
PR is merged to `main`.

---

## Creating a New Post

1. Create a folder under `posts/` using your post's slug as the directory name:

   ```
   posts/your-post-slug/
   ├── index.md          ← article content + frontmatter
   └── assets/           ← images referenced in the article
       └── cover.png
   ```

2. Write your article in `posts/your-post-slug/index.md`.

3. Add the required frontmatter at the top:

   ```markdown
   ---
   title: "Your Post Title"
   slug: your-post-slug
   author: your-email@example.com
   date: "2024-11-15T10:00:00Z"
   category: Angular
   tags:
     - signals
     - angular-19
   status: draft
   difficulty: intermediate
   excerpt: >
     A short summary shown in post lists and SEO meta tags.
   coverImage: ./assets/cover.png   # optional
   ---
   ```

### Frontmatter Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `title` | ✅ | string | Post title |
| `slug` | ✅ | string | URL slug (must match folder name) |
| `author` | ✅ | email | Author's WordPress account email |
| `date` | ✅ | ISO 8601 | Publication date |
| `category` | ✅ | string | WordPress category (created if absent) |
| `tags` | ✅ | string[] | WordPress tags (created if absent) |
| `status` | ✅ | `draft` \| `publish` \| `trash` | Post visibility |
| `difficulty` | ✅ | `beginner` \| `intermediate` \| `advanced` | Reader level |
| `excerpt` | ✅ | string | Short summary |
| `coverImage` | ❌ | relative path | Featured image (e.g. `./assets/cover.png`) |

### Inline Images

Reference images with a relative path to the `assets/` folder:

```markdown
![Alt text](./assets/diagram.svg)
```

The pipeline uploads each image to the WordPress Media Library and replaces the
path with the remote URL before publishing.

---

## Publishing Flow

```
Author → Fork / branch → Write post → Open PR
  ↓
Reviewer → Review & approve
  ↓
Maintainer → Merge to main
  ↓
GitHub Actions → Detect changed posts → Publish to WordPress
```

1. **Open a Pull Request** targeting `main`.
2. Reviewers check content, code examples, and frontmatter.
3. A maintainer merges the PR.
4. The **Publish Posts** GitHub Actions workflow runs automatically, detects
   which `posts/*/index.md` files changed, and creates or updates the
   corresponding WordPress posts.

---

## Updating a Post

Simply edit the existing `posts/{slug}/index.md` (and any assets), then open a
PR and merge as usual. The pipeline detects the change and calls the WordPress
update API — no manual intervention needed.

---

## Soft-Deleting a Post

### Preferred — set `status: trash` in frontmatter

Change the post's `status` field to `trash` and merge the PR. The pipeline will
move the WordPress post to the trash while keeping the Markdown source in the
repository for reference.

```yaml
status: trash   # was: publish
```

### Alternative — delete the folder

Deleting the `posts/{slug}/` folder also triggers a trash action in WordPress.
A warning is logged recommending the frontmatter approach instead, because the
source is then permanently lost.

---

## Required GitHub Secrets

Configure the following secrets in **Settings → Secrets and variables →
Actions** of your fork / repository:

| Secret | Description |
|--------|-------------|
| `WP_URL` | Full URL of your WordPress site, e.g. `https://angular.love` |
| `WP_AUTH_USER` | WordPress username of the publishing account |
| `WP_AUTH_PASSWORD` | WordPress **Application Password** (not the login password) |

### How to create a WordPress Application Password

1. Log in to WordPress admin (`/wp-admin`).
2. Go to **Users → Profile**.
3. Scroll to **Application Passwords**.
4. Enter a name (e.g. `GitHub Actions`) and click **Add New Application Password**.
5. Copy the generated password — it is only shown once.
6. Paste it as the `WP_AUTH_PASSWORD` secret value.

---

## Local Development

Inject the required env vars and run the publish script directly:

```bash
export WP_URL=https://angular.love
export WP_AUTH_USER=your-wp-username
export WP_AUTH_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"

pnpm install
pnpm tsx scripts/publish.ts
```

The script will diff `HEAD~1..HEAD`, detect changed posts, and publish them.
On the very first commit (no `HEAD~1`), it falls back to publishing every post
found under `posts/`.

---

## WordPress Prerequisites

For the pipeline to work correctly your WordPress installation must:

1. **Use pretty permalinks** — Settings → Permalinks → Post name (`/%postname%/`).
   The WP REST API requires this; the default `?p=123` structure breaks routing.

2. **Register custom meta fields** — `reading_time` and `difficulty` must be
   registered with `show_in_rest: true` for the REST API to accept them.
   Add the following to your theme's `functions.php` or a custom plugin:

   ```php
   add_action('init', function () {
       foreach (['reading_time', 'difficulty'] as $key) {
           register_post_meta('post', $key, [
               'show_in_rest' => true,
               'single'       => true,
               'type'         => 'string',
               'auth_callback' => fn() => current_user_can('edit_posts'),
           ]);
       }
   });
   ```

3. **Application Passwords enabled** — available by default on WordPress 5.6+
   over HTTPS. On HTTP you need to add
   `add_filter('wp_is_application_passwords_available', '__return_true');`
   (development only — never do this in production without HTTPS).

---

## Project Structure

```
angular-love-articles/
├── .github/
│   └── workflows/
│       └── publish.yaml      ← CI/CD pipeline
├── posts/
│   └── {slug}/
│       ├── index.md          ← article + frontmatter
│       └── assets/           ← images for this post
├── scripts/
│   ├── types.ts              ← shared TypeScript interfaces
│   ├── diff.ts               ← git diff helpers
│   ├── markdown.ts           ← MD→HTML conversion + reading time
│   ├── images.ts             ← image scanning & path replacement
│   ├── wordpress.ts          ← WordPress REST API client
│   └── publish.ts            ← entry-point orchestrator
├── package.json
├── tsconfig.json
└── README.md
```
