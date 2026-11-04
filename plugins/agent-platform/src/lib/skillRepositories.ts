import type { Config } from '@backstage/config';
import { canProposeSkillTo } from './skills';

/**
 * One entry of `agentPlatform.skills.repositories`: a plain URL, or
 * `{ url, ref?, path?, readOnly? }`. Mirrors `readSkillRepositories` in
 * plugins/gs-backend/src/agentSkills/skillRepositories.ts, which applies `ref`
 * and `path` and refuses pull requests into a read-only source; the frontend
 * only needs the URL and `readOnly`.
 */
export interface SkillRepositoryEntry {
  url: string;
  readOnly: boolean;
}

/** The configured skill repositories; malformed entries are left out. */
export function skillRepositoriesFrom(
  config: Config | undefined,
): SkillRepositoryEntry[] {
  const raw = config?.getOptional('agentPlatform.skills.repositories');
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: SkillRepositoryEntry[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (entry.trim()) {
        entries.push({ url: entry.trim(), readOnly: false });
      }
    } else if (
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      typeof entry.url === 'string' &&
      entry.url.trim()
    ) {
      entries.push({
        url: entry.url.trim(),
        readOnly: entry.readOnly === true,
      });
    }
  }
  return entries;
}

/**
 * The repositories Add skill can target: writable github.com ones, the only
 * ones `POST /agent-skills/pull-request` accepts.
 */
export function proposableRepositories(
  repositories: SkillRepositoryEntry[],
): string[] {
  return repositories
    .filter(repository => !repository.readOnly)
    .map(repository => repository.url)
    .filter(canProposeSkillTo);
}
