import type { Config } from '@backstage/config';
import { canProposeSkillTo } from './skills';

/**
 * A configured skill source as gs-backend `/agent-skills` describes it. The
 * backend parses `agentPlatform.skills.repositories` and decides what the
 * pull-request route takes, so the portal repeats none of those rules.
 */
export interface SkillSource {
  url: string;
  /** The pull-request route takes a skill into it: Add skill can target it. */
  proposable: boolean;
  /** Directory scanned, repository-relative; '' = the whole repository. */
  path: string;
  /** Branch, tag or commit read; the default branch when absent. */
  ref?: string;
  readOnly: boolean;
}

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
 * The URLs of `agentPlatform.skills.repositories` (a URL, or an object with
 * `url`), each once: the sources to ask `/agent-skills` about. Everything
 * else about an entry is the backend's to read.
 */
export function skillRepositoryUrls(config: Config | undefined): string[] {
  const raw = config?.getOptional('agentPlatform.skills.repositories');
  if (!Array.isArray(raw)) {
    return [];
  }
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    let url = '';
    if (typeof entry === 'string') {
      url = entry;
    } else if (
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      typeof entry.url === 'string'
    ) {
      url = entry.url;
    }
    if (url.trim() && !seen.has(repositoryKey(url))) {
      seen.add(repositoryKey(url));
      urls.push(url.trim());
    }
  }
  return urls;
}

/** The sources Add skill can target. */
export function proposableSources(sources: SkillSource[]): SkillSource[] {
  return sources.filter(source => source.proposable);
}

/** Writable sources Add skill cannot target for not being on github.com. */
export function offGitHubSources(sources: SkillSource[]): SkillSource[] {
  return sources.filter(
    source => !source.readOnly && !canProposeSkillTo(source.url),
  );
}
