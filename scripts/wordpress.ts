import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { WordPressPost, WordPressMedia, WordPressUser, WordPressCategory, WordPressTag, WordPressPayload } from './types.js';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

interface ClientOptions {
  url: string;
  user: string;
  password: string;
}

export class WordPressClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly categoryCache = new Map<string, number>();
  private readonly tagCache = new Map<string, number>();

  constructor({ url, user, password }: ClientOptions) {
    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    this.baseUrl = normalizedUrl.replace(/\/$/, '') + '/wp-json/wp/v2';
    this.authHeader = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(options.headers as HeadersInit | undefined);
    headers.set('Authorization', this.authHeader);

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`WP API error ${response.status} ${response.statusText} — ${url}\n${body}`);
    }

    return response.json() as Promise<T>;
  }

  async resolveAuthor(email: string): Promise<number> {
    const users = await this.request<WordPressUser[]>(
      `/users?search=${encodeURIComponent(email)}&context=edit&per_page=100`,
    );
    const user = users.find((u) => u.email === email);
    if (!user) {
      throw new Error(`WordPress user with email "${email}" not found`);
    }
    return user.id;
  }

  async resolveCategory(name: string): Promise<number> {
    const cached = this.categoryCache.get(name.toLowerCase());
    if (cached !== undefined) return cached;

    const results = await this.request<WordPressCategory[]>(
      `/categories?search=${encodeURIComponent(name)}&per_page=100`,
    );
    const existing = results.find((c) => c.name.toLowerCase() === name.toLowerCase());

    if (existing) {
      this.categoryCache.set(name.toLowerCase(), existing.id);
      return existing.id;
    }

    const created = await this.request<WordPressCategory>('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    this.categoryCache.set(name.toLowerCase(), created.id);
    return created.id;
  }

  async resolveTag(name: string): Promise<number> {
    const cached = this.tagCache.get(name.toLowerCase());
    if (cached !== undefined) return cached;

    const results = await this.request<WordPressTag[]>(
      `/tags?search=${encodeURIComponent(name)}&per_page=100`,
    );
    const existing = results.find((t) => t.name.toLowerCase() === name.toLowerCase());

    if (existing) {
      this.tagCache.set(name.toLowerCase(), existing.id);
      return existing.id;
    }

    const created = await this.request<WordPressTag>('/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    this.tagCache.set(name.toLowerCase(), created.id);
    return created.id;
  }

  async findPostBySlug(slug: string): Promise<{ id: number } | null> {
    const posts = await this.request<WordPressPost[]>(
      `/posts?slug=${encodeURIComponent(slug)}&status=any&per_page=1`,
    );
    return posts.length > 0 ? { id: posts[0].id } : null;
  }

  async createPost(payload: WordPressPayload): Promise<number> {
    const post = await this.request<WordPressPost>('/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return post.id;
  }

  async updatePost(id: number, payload: WordPressPayload): Promise<number> {
    const post = await this.request<WordPressPost>(`/posts/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return post.id;
  }

  async trashPost(id: number): Promise<void> {
    await this.request<WordPressPost>(`/posts/${id}`, { method: 'DELETE' });
  }

  async uploadMedia(filePath: string): Promise<WordPressMedia> {
    const buffer = readFileSync(filePath);
    const name = basename(filePath);
    const ext = extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] ?? 'application/octet-stream';

    const formData = new FormData();
    formData.append('file', new File([buffer], name, { type }));

    // Do NOT set Content-Type header — let FormData set the multipart boundary automatically
    return this.request<WordPressMedia>('/media', {
      method: 'POST',
      body: formData,
    });
  }
}
