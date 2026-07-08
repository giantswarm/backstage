export function isMarkdownFile(path: string): boolean {
  return /\.(md|mdx)$/i.test(path);
}

/**
 * Split a leading YAML frontmatter block off a markdown document. Rendering
 * frontmatter as markdown garbles the document -- `text` followed by `---`
 * parses as a giant setext heading -- so it is shown separately.
 */
export function splitFrontmatter(markdown: string): {
  frontmatter?: string;
  body: string;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { body: markdown };
  }
  return { frontmatter: match[1], body: markdown.slice(match[0].length) };
}

/**
 * Text of the first ATX heading in a markdown document (frontmatter
 * ignored), used as a pretty display title. Undefined when the document has
 * no heading.
 */
export function firstHeading(markdown: string): string | undefined {
  const { body } = splitFrontmatter(markdown);
  // ponytail: a `#` line inside a fenced code block would match too; plan
  // documents start with a real heading, so full markdown parsing is not
  // worth it here.
  const match = body.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m);
  return match?.[1];
}

export function isHtmlFile(path: string): boolean {
  return /\.html?$/i.test(path);
}

/** Files the plans viewer can render inline. */
export function isRenderableFile(path: string): boolean {
  return isMarkdownFile(path) || isHtmlFile(path);
}

/**
 * Sort paths for display: README/index first, then alphabetically, with
 * shallower paths before deeper ones.
 */
export function compareDisplayPaths(a: string, b: string): number {
  const depthA = a.split('/').length;
  const depthB = b.split('/').length;
  if (depthA !== depthB) {
    return depthA - depthB;
  }
  const rankA = displayRank(a);
  const rankB = displayRank(b);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return a.localeCompare(b);
}

function displayRank(path: string): number {
  const base = path.split('/').pop()?.toLowerCase() ?? '';
  if (base === 'readme.md') return 0;
  if (base.startsWith('index.')) return 1;
  return 2;
}
