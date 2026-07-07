export function isMarkdownFile(path: string): boolean {
  return /\.(md|mdx)$/i.test(path);
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
