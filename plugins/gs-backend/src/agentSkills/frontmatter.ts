import { loadAll } from 'js-yaml';

export interface SkillFrontmatter {
  name?: string;
  description?: string;
}

// Leading YAML frontmatter block: `---` … `---` at the very start of the file
// (tolerating a BOM and CRLF line endings).
const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

/**
 * A `SKILL.md` split into its frontmatter — every key, not only the two the
 * catalog reads, so an edit can write the others back unchanged — and the
 * Markdown body under it. A file without (parseable) frontmatter has an empty
 * one, and the whole file is its body.
 */
export function splitSkillMarkdown(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: content.replace(/^\uFEFF/, '') };
  }
  const body = content.slice(match[0].length).replace(/^(?:\r?\n)+/, '');

  let parsed: unknown;
  try {
    // loadAll tolerates empty/comment-only blocks (js-yaml v5's load() throws
    // on those); take the first document.
    parsed = loadAll(match[1])[0];
  } catch {
    return { frontmatter: {}, body };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { frontmatter: {}, body };
  }
  return { frontmatter: parsed as Record<string, unknown>, body };
}

/**
 * Extracts the `name` and `description` from a `SKILL.md`'s YAML frontmatter.
 * Returns an empty object when there is no frontmatter or it can't be parsed —
 * discovery falls back to a directory-derived name in that case.
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const { frontmatter: fm } = splitSkillMarkdown(content);
  return {
    name: typeof fm.name === 'string' ? fm.name : undefined,
    description:
      typeof fm.description === 'string' ? fm.description : undefined,
  };
}
