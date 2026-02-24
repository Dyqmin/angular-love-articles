const IMAGE_REGEX = /!\[([^\]]*)\]\((\.\/assets\/[^)]+)\)/g;

export function scanMarkdownImages(body: string): string[] {
  const paths = new Set<string>();
  let match: RegExpExecArray | null;
  IMAGE_REGEX.lastIndex = 0;
  while ((match = IMAGE_REGEX.exec(body)) !== null) {
    paths.add(match[2]);
  }
  return Array.from(paths);
}

export function replaceImagePaths(body: string, mapping: Map<string, string>): string {
  return body.replace(IMAGE_REGEX, (full, alt, path) => {
    const wpUrl = mapping.get(path);
    return wpUrl ? `![${alt}](${wpUrl})` : full;
  });
}
