import { createHash } from 'node:crypto';

/**
 * A skill is its whole directory — `SKILL.md` plus the references, scripts
 * and data next to it, which an agent's runtime materialises with it. This
 * module is the provider-agnostic half of listing and reading those files:
 * which skill a file belongs to, the caps, and how a file is answered.
 */

/** One file of a skill at a commit. */
export interface SkillFile {
  /** Relative to the skill directory (`references/x.md`, `SKILL.md`). */
  path: string;
  /** Size in bytes. */
  size: number;
  /** The git blob id (SHA-1 of `blob <size>\0<content>`). */
  sha: string;
}

/** The files of one skill, as discovery keeps them. */
export interface SkillFileList {
  /**
   * At most {@link MAX_SKILL_FILES} files: `SKILL.md` first, the rest by
   * path.
   */
  files: SkillFile[];
  /** True when the skill has more files than {@link MAX_SKILL_FILES}. */
  truncated: boolean;
  /** How many files the skill has, including any past the cap. */
  total: number;
}

/** What `GET /agent-skills/content/file` answers. */
export interface SkillFileContent extends SkillFile {
  /**
   * Binary by extension or content (a NUL byte in the first 8,000 bytes, git's
   * own heuristic); never answered inline.
   */
  binary: boolean;
  /** Larger than {@link MAX_INLINE_FILE_BYTES}; not answered inline. */
  truncated: boolean;
  /** The file as UTF-8 text; absent for a binary or oversize file. */
  content?: string;
}

/** Files listed per skill (PO decision 2026-10-11: 200, plus a flag). */
export const MAX_SKILL_FILES = 200;

/** The largest file answered inline (PO decision 2026-10-11: 512 KB). */
export const MAX_INLINE_FILE_BYTES = 512 * 1024;

/** How far into a file the NUL sniff looks — what git itself checks. */
const BINARY_SNIFF_BYTES = 8000;

const SKILL_FILE = 'SKILL.md';

/**
 * Extensions read as binary without looking at the bytes, so such a file is
 * never fetched just to find out.
 */
const BINARY_EXTENSIONS = new Set([
  '7z',
  'a',
  'avi',
  'bin',
  'bmp',
  'bz2',
  'class',
  'db',
  'dll',
  'doc',
  'docx',
  'dylib',
  'eot',
  'exe',
  'flac',
  'gif',
  'gz',
  'ico',
  'jar',
  'jpeg',
  'jpg',
  'mkv',
  'mov',
  'mp3',
  'mp4',
  'npy',
  'npz',
  'o',
  'odt',
  'ogg',
  'otf',
  'parquet',
  'pdf',
  'pkl',
  'png',
  'ppt',
  'pptx',
  'psd',
  'pyc',
  'so',
  'sqlite',
  'tar',
  'tgz',
  'tif',
  'tiff',
  'ttf',
  'war',
  'wasm',
  'wav',
  'webm',
  'webp',
  'woff',
  'woff2',
  'xls',
  'xlsx',
  'xz',
  'zip',
]);

/**
 * Whether `file` is a well-formed path relative to a skill directory: no
 * leading `/`, no empty, `.` or `..` segment, no backslash or control
 * character. Only the syntax — whether the skill has such a file is the
 * discovered file list's to say.
 */
export function isSkillFilePath(file: string): boolean {
  if (file.length === 0 || file.length > 1024) {
    return false;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(file)) {
    return false;
  }
  return file
    .split('/')
    .every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

/** A skill file's path within the repository. */
export function repositoryFilePath(skillDir: string, file: string): string {
  return skillDir ? `${skillDir}/${file}` : file;
}

/** Whether the file's extension says it is binary. */
export function isBinaryFileName(file: string): boolean {
  const name = file.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && BINARY_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Whether the bytes look binary: a NUL among the first 8,000. */
export function looksBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < end; i++) {
    if (bytes[i] === 0) {
      return true;
    }
  }
  return false;
}

/** The git blob id of `bytes` (SHA-1), the id a GitHub tree carries. */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

/**
 * Whether the file's bytes are needed to answer it: a file over the inline
 * cap or binary by name is answered from the listing alone.
 */
export function needsFileBytes(file: SkillFile): boolean {
  return file.size <= MAX_INLINE_FILE_BYTES && !isBinaryFileName(file.path);
}

/**
 * The answer for one file. `bytes` is the file's content, needed when
 * {@link needsFileBytes} says so; `binary` instead of bytes is a content
 * sniff already made (a cache keeps binary files without their bytes).
 */
export function skillFileContent(
  file: SkillFile,
  read?: { bytes?: Uint8Array; binary?: boolean },
): SkillFileContent {
  const answer = { path: file.path, size: file.size, sha: file.sha };
  const binaryByName = isBinaryFileName(file.path);
  const tooLarge =
    file.size > MAX_INLINE_FILE_BYTES ||
    (read?.bytes?.length ?? 0) > MAX_INLINE_FILE_BYTES;
  if (binaryByName || tooLarge) {
    return { ...answer, binary: binaryByName, truncated: tooLarge };
  }
  if (read?.binary) {
    return { ...answer, binary: true, truncated: false };
  }
  if (!read?.bytes) {
    throw new Error(`The content of ${file.path} is needed to answer it`);
  }
  if (looksBinary(read.bytes)) {
    return { ...answer, binary: true, truncated: false };
  }
  return {
    ...answer,
    binary: false,
    truncated: false,
    content: Buffer.from(read.bytes).toString('utf8'),
  };
}

/** `SKILL.md` first, then by path (code-unit order, locale-independent). */
function compareSkillFiles(a: SkillFile, b: SkillFile): number {
  if (a.path === SKILL_FILE) {
    return -1;
  }
  if (b.path === SKILL_FILE) {
    return 1;
  }
  if (a.path < b.path) {
    return -1;
  }
  return a.path > b.path ? 1 : 0;
}

/**
 * Assigns every file of a repository to the skill it belongs to and caps each
 * skill's list. A file belongs to the **deepest** skill directory containing
 * it: a `SKILL.md` in a subfolder makes that subfolder its own skill, whose
 * files are not the parent's. Files under no skill directory are dropped.
 *
 * `files` carry repository-relative paths; the lists carry paths relative to
 * their skill directory. Every skill directory gets a list (an empty one when
 * nothing was found for it).
 */
export function assignSkillFiles(
  skillDirs: Iterable<string>,
  files: Iterable<SkillFile>,
): Map<string, SkillFileList> {
  const dirs = new Set(skillDirs);
  const byDir = new Map<string, SkillFile[]>();
  for (const dir of dirs) {
    byDir.set(dir, []);
  }
  for (const file of files) {
    const segments = file.path.split('/');
    // Walk up from the file's own directory; the first skill root wins.
    for (let depth = segments.length - 1; depth >= 0; depth--) {
      const dir = segments.slice(0, depth).join('/');
      if (dirs.has(dir)) {
        byDir.get(dir)!.push({
          ...file,
          path: dir ? file.path.slice(dir.length + 1) : file.path,
        });
        break;
      }
    }
  }

  const lists = new Map<string, SkillFileList>();
  for (const [dir, all] of byDir) {
    all.sort(compareSkillFiles);
    lists.set(dir, {
      files: all.slice(0, MAX_SKILL_FILES),
      truncated: all.length > MAX_SKILL_FILES,
      total: all.length,
    });
  }
  return lists;
}
