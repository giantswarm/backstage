import type { Config } from '@backstage/config';
import { canProposeSkillTo, type RefKind } from './skills';

/**
 * One entry of `agentPlatform.skills.repositories`: a plain URL, or
 * `{ url, ref?, path?, readOnly? }`. Parsed by the same rules as
 * `readSkillRepositories` in
 * plugins/gs-backend/src/agentSkills/skillRepositories.ts (which logs what it
 * leaves out): a malformed entry and a later entry for a URL already listed
 * are left out, and `path` is normalized the same way.
 */
export interface SkillRepositoryEntry {
  url: string;
  /** Branch, tag or commit read; the default branch when absent. */
  ref?: string;
  /** Directory scanned, repository-relative; '' = the whole repository. */
  path: string;
  readOnly: boolean;
}

/** A full commit id (SHA-1 or SHA-256). */
const COMMIT_ID_RE = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

/**
 * How the backend compares repository URLs (`repositoryKey`): trimmed, no
 * trailing slashes or `.git`, lowercase.
 */
export function repositoryKey(repoUrl: string): string {
  return repoUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
}

/**
 * A configured `path`, repository-relative: `.` and empty segments dropped;
 * undefined for one that is not a plain relative directory.
 */
export function normalizeScanPath(path: string): string | undefined {
  const segments = path
    .trim()
    .split('/')
    .filter(segment => segment !== '' && segment !== '.');
  // eslint-disable-next-line no-control-regex
  const bad = /[\\\u0000-\u001f\u007f]/;
  return segments.some(segment => segment === '..' || bad.test(segment))
    ? undefined
    : segments.join('/');
}

/** The configured skill repositories, each URL once. */
export function skillRepositoriesFrom(
  config: Config | undefined,
): SkillRepositoryEntry[] {
  const raw = config?.getOptional('agentPlatform.skills.repositories');
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: SkillRepositoryEntry[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    let parsed: SkillRepositoryEntry | undefined;
    if (typeof entry === 'string') {
      parsed = entry.trim()
        ? { url: entry.trim(), path: '', readOnly: false }
        : undefined;
    } else if (
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      typeof entry.url === 'string' &&
      entry.url.trim()
    ) {
      const path = normalizeScanPath(
        typeof entry.path === 'string' ? entry.path : '',
      );
      const ref = typeof entry.ref === 'string' ? entry.ref.trim() : '';
      parsed =
        path === undefined
          ? undefined
          : {
              url: entry.url.trim(),
              ...(ref ? { ref } : {}),
              path,
              readOnly: entry.readOnly === true,
            };
    }
    if (parsed && !seen.has(repositoryKey(parsed.url))) {
      seen.add(repositoryKey(parsed.url));
      entries.push(parsed);
    }
  }
  return entries;
}

/**
 * Whether Add skill can target the source: writable, on github.com, and read
 * on a branch — the default one, or a configured `ref` discovery found to be
 * a branch (`refKinds`, by `repositoryKey`). The same rules
 * `POST /agent-skills/pull-request` enforces.
 */
export function canProposeTo(
  repository: SkillRepositoryEntry,
  refKinds: Record<string, RefKind> = {},
): boolean {
  if (repository.readOnly || !canProposeSkillTo(repository.url)) {
    return false;
  }
  if (!repository.ref) {
    return true;
  }
  return (
    !COMMIT_ID_RE.test(repository.ref) &&
    refKinds[repositoryKey(repository.url)] === 'branch'
  );
}

/** The sources Add skill can target (see `canProposeTo`). */
export function proposableRepositories(
  repositories: SkillRepositoryEntry[],
  refKinds?: Record<string, RefKind>,
): SkillRepositoryEntry[] {
  return repositories.filter(repository => canProposeTo(repository, refKinds));
}
