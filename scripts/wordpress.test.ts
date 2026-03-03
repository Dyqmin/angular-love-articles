import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));

import { readFileSync } from 'node:fs';
import { WordPressClient } from './wordpress.js';

const mockReadFileSync = vi.mocked(readFileSync);

// ── Fetch mock helpers ────────────────────────────────────────────────────────

type FetchResponse = { ok: boolean; status?: number; statusText?: string; json?: unknown; text?: string };

function makeResponse(opts: FetchResponse) {
  return Promise.resolve({
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    statusText: opts.statusText ?? (opts.ok ? 'OK' : 'Error'),
    json: () => Promise.resolve(opts.json ?? null),
    text: () => Promise.resolve(opts.text ?? JSON.stringify(opts.json ?? null)),
  });
}

function mockFetch(...responses: FetchResponse[]) {
  const fn = vi.fn();
  responses.forEach((r) => fn.mockReturnValueOnce(makeResponse(r)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function makeClient(url = 'https://wp.example.com', user = 'admin', password = 'secret') {
  return new WordPressClient({ url, user, password });
}

function getCalledUrl(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0): string {
  return fetchMock.mock.calls[callIndex][0] as string;
}

function getCalledHeaders(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0): Headers {
  return fetchMock.mock.calls[callIndex][1].headers as Headers;
}

beforeEach(() => {
  mockReadFileSync.mockReturnValue(Buffer.from('fake-image-data') as unknown as string);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe('WordPressClient constructor', () => {
  it('prepends https:// when URL has no scheme', async () => {
    const fetch = mockFetch({ ok: true, json: [] });
    const client = new WordPressClient({ url: 'wp.example.com', user: 'u', password: 'p' });
    await client.findPostBySlug('test');
    expect(getCalledUrl(fetch)).toMatch(/^https:\/\/wp\.example\.com/);
  });

  it('keeps https:// scheme unchanged', async () => {
    const fetch = mockFetch({ ok: true, json: [] });
    await makeClient('https://wp.example.com').findPostBySlug('test');
    expect(getCalledUrl(fetch)).toMatch(/^https:\/\/wp\.example\.com/);
  });

  it('keeps http:// scheme unchanged', async () => {
    const fetch = mockFetch({ ok: true, json: [] });
    await makeClient('http://wp.local').findPostBySlug('test');
    expect(getCalledUrl(fetch)).toMatch(/^http:\/\/wp\.local/);
  });

  it('strips trailing slash from URL', async () => {
    const fetch = mockFetch({ ok: true, json: [] });
    await makeClient('https://wp.example.com/').findPostBySlug('test');
    // The scheme https:// is fine; double slash must not appear in the path
    expect(getCalledUrl(fetch)).not.toMatch(/com\/\/wp-json/);
    expect(getCalledUrl(fetch)).toContain('/wp-json/wp/v2/');
  });

  it('encodes Basic Auth credentials correctly', async () => {
    const fetch = mockFetch({ ok: true, json: [] });
    const client = new WordPressClient({ url: 'https://wp.example.com', user: 'myuser', password: 'mypass' });
    await client.findPostBySlug('test');
    const expected = 'Basic ' + Buffer.from('myuser:mypass').toString('base64');
    expect(getCalledHeaders(fetch).get('Authorization')).toBe(expected);
  });

  it('includes Authorization header on every request', async () => {
    const fetch = mockFetch(
      { ok: true, json: [] },
      { ok: true, json: [] },
    );
    const client = makeClient();
    await client.findPostBySlug('test');
    await client.findPostBySlug('other');
    expect(getCalledHeaders(fetch, 0).get('Authorization')).toBeTruthy();
    expect(getCalledHeaders(fetch, 1).get('Authorization')).toBeTruthy();
  });
});

// ── resolveAuthor ─────────────────────────────────────────────────────────────

describe('resolveAuthor', () => {
  it('returns user ID for exact email match', async () => {
    mockFetch({ ok: true, json: [
      { id: 1, name: 'Alice', email: 'alice@example.com', slug: 'alice' },
      { id: 2, name: 'Bob', email: 'bob@example.com', slug: 'bob' },
    ]});
    expect(await makeClient().resolveAuthor('bob@example.com')).toBe(2);
  });

  it('throws when email is not found', async () => {
    mockFetch({ ok: true, json: [] });
    await expect(makeClient().resolveAuthor('ghost@example.com'))
      .rejects.toThrow('WordPress user with email "ghost@example.com" not found');
  });

  it('does not return a partial email match', async () => {
    mockFetch({ ok: true, json: [
      { id: 9, name: 'Bob Jr', email: 'bob.jr@example.com', slug: 'bob-jr' },
    ]});
    await expect(makeClient().resolveAuthor('bob@example.com'))
      .rejects.toThrow('not found');
  });

  it('uses context=edit in request URL', async () => {
    const fetch = mockFetch({ ok: true, json: [{ id: 1, email: 'u@example.com', name: 'U', slug: 'u' }] });
    await makeClient().resolveAuthor('u@example.com');
    expect(getCalledUrl(fetch)).toContain('context=edit');
  });

  it('throws on API error (401)', async () => {
    mockFetch({ ok: false, status: 401, text: 'Unauthorized' });
    await expect(makeClient().resolveAuthor('u@example.com'))
      .rejects.toThrow('WP API error 401');
  });
});

// ── resolveCategory ───────────────────────────────────────────────────────────

describe('resolveCategory', () => {
  it('returns ID when category already exists', async () => {
    mockFetch({ ok: true, json: [{ id: 5, name: 'Angular', slug: 'angular' }] });
    expect(await makeClient().resolveCategory('Angular')).toBe(5);
  });

  it('creates category when not found and returns new ID', async () => {
    mockFetch(
      { ok: true, json: [] },
      { ok: true, json: { id: 7, name: 'RxJS', slug: 'rxjs' } },
    );
    expect(await makeClient().resolveCategory('RxJS')).toBe(7);
  });

  it('does exact match (not just substring match)', async () => {
    // API returns "Angular Material" but we're looking for "Angular"
    mockFetch({ ok: true, json: [{ id: 3, name: 'Angular Material', slug: 'angular-material' }] });
    // Client should not match "Angular Material" for "Angular" — falls through to create
    const fetch = vi.fn()
      .mockReturnValueOnce(makeResponse({ ok: true, json: [{ id: 3, name: 'Angular Material', slug: 'angular-material' }] }))
      .mockReturnValueOnce(makeResponse({ ok: true, json: { id: 8, name: 'Angular', slug: 'angular' } }));
    vi.stubGlobal('fetch', fetch);
    const id = await makeClient().resolveCategory('Angular');
    expect(id).toBe(8); // created, not matched
  });

  it('is case-insensitive when matching', async () => {
    mockFetch({ ok: true, json: [{ id: 5, name: 'angular', slug: 'angular' }] });
    expect(await makeClient().resolveCategory('Angular')).toBe(5);
  });

  it('caches the result — same name makes only one API call', async () => {
    const fetch = vi.fn()
      .mockReturnValueOnce(makeResponse({ ok: true, json: [{ id: 5, name: 'Angular', slug: 'angular' }] }));
    vi.stubGlobal('fetch', fetch);
    const client = makeClient();
    await client.resolveCategory('Angular');
    await client.resolveCategory('Angular');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cache is per-instance', async () => {
    const fetch = vi.fn()
      .mockReturnValue(makeResponse({ ok: true, json: [{ id: 5, name: 'Angular', slug: 'angular' }] }));
    vi.stubGlobal('fetch', fetch);
    const a = makeClient();
    const b = makeClient();
    await a.resolveCategory('Angular');
    await b.resolveCategory('Angular');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

// ── resolveTag ────────────────────────────────────────────────────────────────

describe('resolveTag', () => {
  it('returns ID when tag already exists', async () => {
    mockFetch({ ok: true, json: [{ id: 10, name: 'signals', slug: 'signals' }] });
    expect(await makeClient().resolveTag('signals')).toBe(10);
  });

  it('creates tag when not found', async () => {
    mockFetch(
      { ok: true, json: [] },
      { ok: true, json: { id: 11, name: 'new-tag', slug: 'new-tag' } },
    );
    expect(await makeClient().resolveTag('new-tag')).toBe(11);
  });

  it('caches the result', async () => {
    const fetch = vi.fn()
      .mockReturnValueOnce(makeResponse({ ok: true, json: [{ id: 10, name: 'signals', slug: 'signals' }] }));
    vi.stubGlobal('fetch', fetch);
    const client = makeClient();
    await client.resolveTag('signals');
    await client.resolveTag('signals');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('tag and category caches are independent', async () => {
    const fetch = vi.fn()
      .mockReturnValueOnce(makeResponse({ ok: true, json: [{ id: 5, name: 'Angular', slug: 'angular' }] }))
      .mockReturnValueOnce(makeResponse({ ok: true, json: [{ id: 5, name: 'Angular', slug: 'angular' }] }));
    vi.stubGlobal('fetch', fetch);
    const client = makeClient();
    await client.resolveCategory('Angular');
    await client.resolveTag('Angular');
    expect(fetch).toHaveBeenCalledTimes(2); // separate caches
  });
});

// ── findPostBySlug ────────────────────────────────────────────────────────────

describe('findPostBySlug', () => {
  it('returns { id } when post is found', async () => {
    mockFetch({ ok: true, json: [{ id: 42, slug: 'my-post', status: 'publish', title: {}, content: {} }] });
    expect(await makeClient().findPostBySlug('my-post')).toEqual({ id: 42 });
  });

  it('returns null when no post found', async () => {
    mockFetch({ ok: true, json: [] });
    expect(await makeClient().findPostBySlug('missing')).toBeNull();
  });

  it('includes status=any in URL', async () => {
    const fetch = mockFetch({ ok: true, json: [] });
    await makeClient().findPostBySlug('my-post');
    expect(getCalledUrl(fetch)).toContain('status=any');
  });

  it('appends lang param when provided', async () => {
    const fetch = mockFetch({ ok: true, json: [] });
    await makeClient().findPostBySlug('my-post', 'en');
    expect(getCalledUrl(fetch)).toContain('lang=en');
  });

  it('appends lang=pl when language is pl', async () => {
    const fetch = mockFetch({ ok: true, json: [] });
    await makeClient().findPostBySlug('my-post', 'pl');
    expect(getCalledUrl(fetch)).toContain('lang=pl');
  });

  it('omits lang param when not provided', async () => {
    const fetch = mockFetch({ ok: true, json: [] });
    await makeClient().findPostBySlug('my-post');
    expect(getCalledUrl(fetch)).not.toContain('lang=');
  });
});

// ── createPost ────────────────────────────────────────────────────────────────

describe('createPost', () => {
  const payload = {
    title: 'My Post',
    slug: 'my-post',
    content: '<p>content</p>',
    excerpt: 'excerpt',
    status: 'draft' as const,
    author: 1,
    categories: [2],
    tags: [3],
    date: '2024-01-01T00:00:00Z',
    lang: 'en' as const,
  };

  it('sends a POST request and returns the new post ID', async () => {
    const fetch = mockFetch({ ok: true, json: { id: 99, slug: 'my-post', status: 'draft', title: {}, content: {} } });
    expect(await makeClient().createPost(payload)).toBe(99);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('/posts');
    expect(init.method).toBe('POST');
  });

  it('sends the payload as JSON', async () => {
    const fetch = mockFetch({ ok: true, json: { id: 1, slug: 'my-post', status: 'draft', title: {}, content: {} } });
    await makeClient().createPost(payload);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.title).toBe('My Post');
    expect(body.lang).toBe('en');
  });
});

// ── updatePost ────────────────────────────────────────────────────────────────

describe('updatePost', () => {
  it('sends POST to /posts/{id} (WP uses POST for updates)', async () => {
    const fetch = mockFetch({ ok: true, json: { id: 42, slug: 'my-post', status: 'draft', title: {}, content: {} } });
    const payload = { title: 'Updated', slug: 'my-post', content: '', excerpt: '', status: 'publish' as const, author: 1, categories: [], tags: [], date: '', lang: 'en' as const };
    await makeClient().updatePost(42, payload);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('/posts/42');
    expect(init.method).toBe('POST');
  });
});

// ── trashPost ─────────────────────────────────────────────────────────────────

describe('trashPost', () => {
  it('sends DELETE to /posts/{id}', async () => {
    const fetch = mockFetch({ ok: true, json: { id: 5, slug: 'x', status: 'trash', title: {}, content: {} } });
    await makeClient().trashPost(5);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('/posts/5');
    expect(init.method).toBe('DELETE');
  });
});

// ── uploadMedia ───────────────────────────────────────────────────────────────

describe('uploadMedia', () => {
  const media = { id: 10, source_url: 'https://wp.example.com/media/diagram.svg', slug: 'diagram', mime_type: 'image/svg+xml' };

  it('returns the media object on success', async () => {
    mockFetch({ ok: true, json: media });
    const result = await makeClient().uploadMedia('/path/to/diagram.svg');
    expect(result.id).toBe(10);
    expect(result.source_url).toContain('diagram.svg');
  });

  it('sends POST to /media', async () => {
    const fetch = mockFetch({ ok: true, json: media });
    await makeClient().uploadMedia('/path/to/img.png');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('/media');
    expect(init.method).toBe('POST');
  });

  it('does NOT manually set Content-Type header (lets FormData set the boundary)', async () => {
    const fetch = mockFetch({ ok: true, json: media });
    await makeClient().uploadMedia('/path/to/diagram.svg');
    const headers = getCalledHeaders(fetch);
    // Only Authorization should be present; Content-Type must be absent
    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('Authorization')).toBeTruthy();
  });

  it('uses correct MIME type for SVG', async () => {
    const fetch = mockFetch({ ok: true, json: media });
    mockReadFileSync.mockReturnValue(Buffer.from('<svg/>') as unknown as string);
    await makeClient().uploadMedia('/img/diagram.svg');
    const body = fetch.mock.calls[0][1].body as FormData;
    const file = body.get('file') as File;
    expect(file.type).toBe('image/svg+xml');
  });

  it.each([
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
  ])('uses correct MIME type for %s', async (ext, mime) => {
    const fetch = mockFetch({ ok: true, json: media });
    await makeClient().uploadMedia(`/img/image${ext}`);
    const body = fetch.mock.calls[0][1].body as FormData;
    const file = body.get('file') as File;
    expect(file.type).toBe(mime);
  });

  it('falls back to application/octet-stream for unknown extension', async () => {
    const fetch = mockFetch({ ok: true, json: media });
    await makeClient().uploadMedia('/img/file.tiff');
    const body = fetch.mock.calls[0][1].body as FormData;
    const file = body.get('file') as File;
    expect(file.type).toBe('application/octet-stream');
  });

  it('reads file content via readFileSync', async () => {
    const buf = Buffer.from('image bytes');
    mockReadFileSync.mockReturnValue(buf as unknown as string);
    mockFetch({ ok: true, json: media });
    await makeClient().uploadMedia('/img/a.png');
    expect(mockReadFileSync).toHaveBeenCalledWith('/img/a.png');
  });

  it('throws on upload failure', async () => {
    mockFetch({ ok: false, status: 413, text: 'File too large' });
    await expect(makeClient().uploadMedia('/img/big.png'))
      .rejects.toThrow('WP API error 413');
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
  it('includes status code in error message', async () => {
    mockFetch({ ok: false, status: 403, statusText: 'Forbidden', text: 'Access denied' });
    await expect(makeClient().findPostBySlug('test'))
      .rejects.toThrow('403');
  });

  it('includes the full URL in error message', async () => {
    mockFetch({ ok: false, status: 500, text: 'Server error' });
    await expect(makeClient().resolveCategory('Angular'))
      .rejects.toThrow('wp.example.com');
  });
});
