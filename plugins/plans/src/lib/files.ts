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

// Friendly, human-readable names for well-known plan file names, keyed by
// lower-cased basename. Extend as new conventions appear.
const FRIENDLY_FILE_NAMES: Record<string, string> = {
  'prd.md': 'Product Requirements Document',
  'index.html': 'Web page',
};

/**
 * A human-friendly name for a well-known plan file (e.g. `PRD.md` →
 * "Product Requirements Document"), matched case-insensitively on the file's
 * basename. Returns undefined for files without a known convention.
 */
export function friendlyFileName(path: string): string | undefined {
  const base = path.split('/').pop()?.toLowerCase() ?? '';
  return FRIENDLY_FILE_NAMES[base];
}

/**
 * Whether any segment of the path is dot-prefixed, i.e. it is (or lives under)
 * a hidden file or folder such as `.agents/…` or `plan/.notes.md`.
 */
export function isDotPath(path: string): boolean {
  return path.split('/').some(segment => segment.startsWith('.'));
}

/**
 * The path with its plan-folder prefix removed, for display in a context that
 * already names the folder (e.g. a per-folder accordion). Paths that don't sit
 * under `folder` — including root-level documents grouped under a synthetic
 * folder name — are returned unchanged.
 */
export function stripFolderPrefix(path: string, folder: string): string {
  const prefix = `${folder}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function displayRank(path: string): number {
  const base = path.split('/').pop()?.toLowerCase() ?? '';
  if (base === 'readme.md') return 0;
  if (base.startsWith('index.')) return 1;
  return 2;
}
