import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { isSkillFilePath } from './skillFiles';
import { repositoryKey } from './skillDiscoveryCache';

export { isBelowPath } from './skillFiles';

/** The config key of the skill sources. */
export const SKILL_REPOSITORIES_KEY = 'agentPlatform.skills.repositories';

/**
 * One entry of `agentPlatform.skills.repositories`, normalized. An entry is a
 * plain URL (the default branch, the whole tree, writable) or an object
 * `{ url, ref?, path?, readOnly? }` — the same shape agent-manager's
 * `skills.repositories` takes. The frontend parses the list by the same rules
 * (plugins/agent-platform/src/lib/skillRepositories.ts).
 */
export interface SkillRepository {
  /** The repository URL as configured (trimmed). */
  url: string;
  /** Branch, tag or commit to read; undefined = the default branch. */
  ref?: string;
  /** Directory scanned for skills, repository-relative; '' = the whole tree. */
  path: string;
  /** No skill pull requests into it (a platform-shipped source). */
  readOnly: boolean;
}

/** A full commit id (SHA-1 or SHA-256). */
export const COMMIT_ID_RE = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

/**
 * A configured `path`, repository-relative: `.` and empty segments dropped
 * (`./skills//x/` is `skills/x`, `.` is the root); undefined for a path that
 * is not a plain relative directory (a `..` segment, control characters).
 */
export function normalizeScanPath(path: string): string | undefined {
  const cleaned = path
    .trim()
    .split('/')
    .filter(segment => segment !== '' && segment !== '.')
    .join('/');
  return cleaned === '' || isSkillFilePath(cleaned) ? cleaned : undefined;
}

/**
 * Every well-formed entry of `agentPlatform.skills.repositories`. A malformed
 * entry (no URL, a path with `..`) and a later entry for a URL already listed
 * (compared by `repositoryKey`) are left out rather than failing every skill
 * route; with `logger` each one left out is logged as an error.
 */
export function readSkillRepositories(
  config: RootConfigService,
  logger?: LoggerService,
): SkillRepository[] {
  const raw = config.getOptional(SKILL_REPOSITORIES_KEY);
  if (!Array.isArray(raw)) {
    return [];
  }
  const repositories: SkillRepository[] = [];
  const seen = new Set<string>();
  const drop = (index: number, why: string) =>
    logger?.error(`${SKILL_REPOSITORIES_KEY}[${index}] ignored: ${why}`);
  raw.forEach((entry, index) => {
    let parsed: SkillRepository | undefined;
    if (typeof entry === 'string') {
      parsed = entry.trim()
        ? { url: entry.trim(), path: '', readOnly: false }
        : undefined;
    } else if (typeof entry === 'object' && entry !== null) {
      const { url, ref, path, readOnly } = entry as Record<string, unknown>;
      const scanPath = normalizeScanPath(typeof path === 'string' ? path : '');
      if (scanPath === undefined) {
        drop(index, `path ${String(path)} is not a relative directory`);
        return;
      }
      parsed =
        typeof url === 'string' && url.trim()
          ? {
              url: url.trim(),
              ref:
                typeof ref === 'string' && ref.trim() ? ref.trim() : undefined,
              path: scanPath,
              readOnly: readOnly === true,
            }
          : undefined;
    }
    if (!parsed) {
      drop(index, 'no url');
      return;
    }
    const key = repositoryKey(parsed.url);
    if (seen.has(key)) {
      drop(index, `${parsed.url} is already listed`);
      return;
    }
    seen.add(key);
    repositories.push(parsed);
  });
  return repositories;
}

/**
 * The configured entry a caller-named repository URL is, compared the way the
 * caches key it (case-insensitive, tolerating `.git` and trailing slashes).
 */
export function findSkillRepository(
  config: RootConfigService,
  repoUrl: string,
): SkillRepository | undefined {
  const target = repositoryKey(repoUrl);
  return readSkillRepositories(config).find(
    repository => repositoryKey(repository.url) === target,
  );
}
