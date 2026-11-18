import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { isSkillFilePath, parseConfiguredRef } from './skillFiles';
import { repositoryKey } from './skillDiscoveryCache';

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
 * route; with `logger` each one is logged (at info: a handled outcome). Any
 * entry's `readOnly: true` makes the kept entry for its URL read-only, so the
 * order of merged config layers cannot open a read-only source to pull
 * requests.
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
  // Any entry marking a URL read-only, the ones left out included.
  const readOnlyKeys = new Set<string>();
  const drop = (index: number, reason: string, url?: string) =>
    logger?.info('Skill repository entry ignored', {
      key: SKILL_REPOSITORIES_KEY,
      index,
      reason,
      ...(url ? { url } : {}),
    });
  raw.forEach((entry, index) => {
    let parsed: SkillRepository | undefined;
    if (typeof entry === 'string') {
      parsed = entry.trim()
        ? { url: entry.trim(), path: '', readOnly: false }
        : undefined;
    } else if (typeof entry === 'object' && entry !== null) {
      const { url, ref, path, readOnly } = entry as Record<string, unknown>;
      if (readOnly === true && typeof url === 'string' && url.trim()) {
        readOnlyKeys.add(repositoryKey(url));
      }
      const scanPath = normalizeScanPath(typeof path === 'string' ? path : '');
      if (scanPath === undefined) {
        drop(index, 'path is not a relative directory', String(url));
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
      drop(index, 'url is already listed', parsed.url);
      return;
    }
    seen.add(key);
    repositories.push(parsed);
  });
  return repositories.map(repository =>
    readOnlyKeys.has(repositoryKey(repository.url))
      ? { ...repository, readOnly: true }
      : repository,
  );
}

/**
 * The configured entries by `repositoryKey`, parsed once: the entry a
 * caller-named repository URL is, compared the way the caches key it
 * (case-insensitive, tolerating `.git` and trailing slashes).
 */
export function skillRepositoriesByKey(
  config: RootConfigService,
  logger?: LoggerService,
): Map<string, SkillRepository> {
  return new Map(
    readSkillRepositories(config, logger).map(
      repository => [repositoryKey(repository.url), repository] as const,
    ),
  );
}

/**
 * The branch pull requests into `repository` target: its configured branch,
 * else the default branch (`undefined`). `null` when its ref is a commit or
 * names a tag (`refs/tags/…`); a plain name that is a tag is refused by
 * `createSkillPullRequest`, which asks GitHub.
 */
export function pullRequestBase(
  repository: SkillRepository,
): string | undefined | null {
  if (!repository.ref) {
    return undefined;
  }
  const { form, name } = parseConfiguredRef(repository.ref);
  return form === 'branch' || form === 'name' ? name : null;
}
