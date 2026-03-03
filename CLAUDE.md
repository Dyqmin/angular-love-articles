# CLAUDE.md — angular-love-posts

## Project overview

This is the content repository for **angular.love**, a community-driven Angular blog. Articles are written in Markdown, reviewed via GitHub PRs, and automatically published to WordPress on merge to `main`.

## Repository structure

```
posts/
  {slug}/
    en.md          # English version
    pl.md          # Polish version (optional)
    assets/        # Images shared between both language versions
      cover.png
      diagram.gif
```

## Article format

Each `.md` file starts with YAML frontmatter:

```yaml
---
title: "Article Title"
author: author@email.com
category: Category Name
difficulty: beginner | intermediate | advanced
tags: [tag1, tag2]
coverImage: ./assets/cover.png
slug: folder-name-must-match
status: draft | publish | trash
---
```

Key rules:
- `slug` must exactly match the folder name
- Both `en.md` and `pl.md` in the same folder must have the same `slug`
- Language is determined by filename, not by a frontmatter field
- Code blocks must always have an explicit language tag for Shiki syntax highlighting

## Automated workflows

- **Article Review** (`article-review` label) — AI reviews article quality, structure, SEO, technical accuracy. Review only, no file changes. Instructions: `.claude/instructions/article-review.md`
- **Auto Translate** (`auto-translate` label) — Creates missing translation file. Instructions: `.claude/instructions/auto-translate.md`
- **Publish** (merge to `main`) — Converts Markdown to HTML and publishes to WordPress via REST API

## Tech context

- Blog frontend: Angular with Shiki for code highlighting
- CMS: WordPress with Polylang plugin for multilingual support
- Code blocks must produce `<pre><code class="language-{lang}">` HTML
- The blog audience is primarily Angular developers, ranging from beginner to advanced