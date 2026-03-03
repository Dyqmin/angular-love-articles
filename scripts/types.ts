export interface PostFrontmatter {
  title: string;
  slug: string;
  author: string; // email
  date: string; // ISO 8601
  category: string;
  tags: string[];
  status: 'draft' | 'publish' | 'trash';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  excerpt: string;
  coverImage?: string; // relative path, e.g. ./assets/cover.jpg
}

export interface ChangedFile {
  slug: string;
  lang: 'en' | 'pl';
}

export interface WordPressPost {
  id: number;
  slug: string;
  status: string;
  title: { rendered: string };
  content: { rendered: string };
}

export interface WordPressMedia {
  id: number;
  source_url: string;
  slug: string;
  mime_type: string;
}

export interface WordPressUser {
  id: number;
  name: string;
  email: string;
  slug: string;
}

export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
}

export interface WordPressTag {
  id: number;
  name: string;
  slug: string;
}

export interface WordPressPayload {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: 'draft' | 'publish';
  author: number;
  categories: number[];
  tags: number[];
  date: string;
  lang: 'en' | 'pl';
  meta?: Record<string, unknown>;
  featured_media?: number;
}

export interface PublishResult {
  slug: string;
  lang: 'en' | 'pl';
  action: 'created' | 'updated' | 'trashed' | 'error';
  postId?: number;
  error?: string;
}
