import { loadAll } from 'js-yaml';

export interface SkillFrontmatter {
  name?: string;
  description?: string;
}

// Leading YAML frontmatter block: `---` … `---` at the very start of the file
// (tolerating a BOM and CRLF line endings).
const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

/**
 * Extracts the `name` and `description` from a `SKILL.md`'s YAML frontmatter.
 * Returns an empty object when there is no frontmatter or it can't be parsed —
 * discovery falls back to a directory-derived name in that case.
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return {};
  }

  let parsed: unknown;
  try {
    // loadAll tolerates empty/comment-only blocks (js-yaml v5's load() throws
    // on those); take the first document.
    parsed = loadAll(match[1])[0];
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  const fm = parsed as Record<string, unknown>;
  return {
    name: typeof fm.name === 'string' ? fm.name : undefined,
    description:
      typeof fm.description === 'string' ? fm.description : undefined,
  };
}
