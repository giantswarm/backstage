import type { RootConfigService } from '@backstage/backend-plugin-api';
import { isSkillFilePath } from './skillFiles';

export { isBelowPath } from './skillFiles';
import { repositoryKey } from './skillDiscoveryCache';

/** The config key of the skill sources. */
export const SKILL_REPOSITORIES_KEY = 'agentPlatform.skills.repositories';

/**
 * One entry of `agentPlatform.skills.repositories`, normalized. An entry is a
 * plain URL (the default branch, the whole tree, writable) or an object
 * `{ url, ref?, path?, readOnly? }` — the same shape agent-manager's
 * `skills.repositories` takes.
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

/** A configured `path` without leading `./`, `/` or trailing slashes. */
function normalizePath(path: string): string | undefined {
  const cleaned = path
    .trim()
    .replace(/^(\.\/|\/)+/, '')
    .replace(/\/+$/, '');
  return cleaned === '' || isSkillFilePath(cleaned) ? cleaned : undefined;
}

/**
 * Every well-formed entry of `agentPlatform.skills.repositories`. A malformed
 * entry (no URL, a path with `..`) is left out rather than failing every skill
 * route.
 */
export function readSkillRepositories(
  config: RootConfigService,
): SkillRepository[] {
  const raw = config.getOptional(SKILL_REPOSITORIES_KEY);
  if (!Array.isArray(raw)) {
    return [];
  }
  const repositories: SkillRepository[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (entry.trim()) {
        repositories.push({ url: entry.trim(), path: '', readOnly: false });
      }
      continue;
    }
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const { url, ref, path, readOnly } = entry as Record<string, unknown>;
    if (typeof url !== 'string' || !url.trim()) {
      continue;
    }
    const scanPath = normalizePath(typeof path === 'string' ? path : '');
    if (scanPath === undefined) {
      continue;
    }
    repositories.push({
      url: url.trim(),
      ref: typeof ref === 'string' && ref.trim() ? ref.trim() : undefined,
      path: scanPath,
      readOnly: readOnly === true,
    });
  }
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
