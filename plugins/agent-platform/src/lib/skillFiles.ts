import type { SkillFile } from './skills';

/** The skill's own instructions file, first in every listing. */
export const SKILL_MD = 'SKILL.md';

/** How many CSV data rows the viewer's table preview shows. */
export const CSV_PREVIEW_ROWS = 50;
/** How many CSV columns the preview shows; the rest are left out. */
export const CSV_PREVIEW_COLUMNS = 20;

/** The directory part of a skill-relative path ('' for a top-level file). */
export function skillFileDir(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** The last segment of a skill-relative path. */
export function skillFileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * A relative reference written in one of the skill's files (`from`, relative
 * to the skill directory), resolved to a skill-relative path — `./`, `..` and
 * percent-escapes applied, a `#fragment` or `?query` dropped. Undefined for
 * anything that is not a relative path (a URL with a scheme, a root-relative
 * `/path`, an in-page `#anchor`) and for one that climbs out of the skill
 * directory: those keep their repository behaviour.
 */
export function resolveSkillFilePath(
  href: string | undefined,
  from: string = SKILL_MD,
): string | undefined {
  if (!href) {
    return undefined;
  }
  const bare = href.trim().replace(/[?#].*$/, '');
  if (
    !bare ||
    bare.startsWith('/') ||
    bare.startsWith('\\') ||
    /^[a-z][a-z\d+.-]*:/i.test(bare)
  ) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    return undefined;
  }
  const segments = skillFileDir(from).split('/').filter(Boolean);
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length === 0) {
        return undefined;
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length > 0 ? segments.join('/') : undefined;
}

/**
 * The listed file a backticked path in prose names (`references/x.md`,
 * `./scripts/query.py`), or undefined. Only an exact match counts — against
 * the skill directory, then against the directory of the file it is written
 * in — so code like `python3 scripts/query.py` or `SELECT *` stays code.
 */
export function matchSkillFileMention(
  text: string,
  paths: ReadonlySet<string>,
  from: string = SKILL_MD,
): string | undefined {
  const candidate = text.trim().replace(/^\.\//, '');
  if (!candidate || /\s/.test(candidate)) {
    return undefined;
  }
  if (paths.has(candidate)) {
    return candidate;
  }
  const relative = resolveSkillFilePath(candidate, from);
  return relative && paths.has(relative) ? relative : undefined;
}

/** How the viewer shows a text file. */
export type SkillFileKind = 'markdown' | 'csv' | 'text';

/** The viewer's mode for a file, by extension: Markdown, a table, or text. */
export function skillFileKind(path: string): SkillFileKind {
  const name = skillFileName(path).toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1) : '';
  if (['md', 'markdown', 'mdc', 'mdx'].includes(ext)) {
    return 'markdown';
  }
  if (ext === 'csv' || ext === 'tsv') {
    return 'csv';
  }
  return 'text';
}

/**
 * Parses CSV (RFC 4180: quoted fields, `""` escapes, newlines inside quotes,
 * CRLF) or, with `delimiter: '\t'`, TSV into rows of cells. A trailing
 * newline does not make an empty last row.
 */
export function parseDelimited(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        cell += char;
      }
      i += 1;
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
    } else {
      cell += char;
    }
    i += 1;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A directory of the skill and its files, in listing order. */
export type SkillFileGroup = { dir: string; files: SkillFile[] };

/**
 * The listing as the tree shows it: the skill directory's own files first
 * (SKILL.md leading, as the backend lists it), then one group per directory,
 * in the order the listing first names it — the backend sorts by path, so
 * `data/`, `references/`, `scripts/` come out alphabetical. Each group is a
 * full directory path, so a deeper folder is its own group under its parent.
 */
export function groupSkillFiles(files: SkillFile[]): SkillFileGroup[] {
  const groups = new Map<string, SkillFile[]>();
  groups.set('', []);
  for (const file of files) {
    const dir = skillFileDir(file.path);
    const group = groups.get(dir);
    if (group) {
      group.push(file);
    } else {
      groups.set(dir, [file]);
    }
  }
  const top = groups.get('')!;
  const skillMd = top.findIndex(file => file.path === SKILL_MD);
  if (skillMd > 0) {
    top.unshift(...top.splice(skillMd, 1));
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([dir, list]) => ({ dir, files: list }));
}
