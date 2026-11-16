import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';

import type { DiscoveredPlugin } from '../lib/plugins';
import type {
  DiscoveredSkill,
  RefKind,
  SkillFileContent,
  SkillFileListing,
} from '../lib/skills';

/**
 * One configured repository as gs-backend's `GET /agent-skills` describes it:
 * its skills and plugins at one commit, and how the backend reads it.
 */
export type SkillRepositoryDiscovery = {
  skills: DiscoveredSkill[];
  /** Absent from older backends. */
  plugins?: DiscoveredPlugin[];
  truncated?: boolean;
  /** Absent for the default branch and from older backends. */
  refKind?: RefKind;
  /** Absent from older backends. */
  proposable?: boolean;
  path?: string;
  readOnly?: boolean;
  ref?: string;
  /** Absent from older backends and for non-GitHub hosts. */
  private?: boolean;
};

/**
 * One skill's SKILL.md at a commit, split the way the add-skill form edits it,
 * with the list of the skill's files (`files`, absent when the backend could
 * not list them). Mirrors `SkillContent` in
 * plugins/gs-backend/src/agentSkills/readSkillContent.ts.
 */
export type SkillContent = {
  repoUrl: string;
  path: string;
  commit: string;
  name: string;
  description: string;
  /** Frontmatter `metadata.tags`; absent from older backends. */
  tags?: string[];
  /** The Markdown body under the frontmatter. */
  instructions: string;
} & SkillFileListing;

/** A skill at the commit the catalog pinned it to. */
export type SkillAt = Pick<
  DiscoveredSkill,
  'repoUrl' | 'path' | 'commit' | 'ref'
>;

/**
 * gs-backend's reads of the skill repositories in
 * `agentPlatform.skills.repositories` (the portal's own skill source, where an
 * installation has no skill-manager). Each failure is an `Error` in the
 * backend's words.
 */
export interface SkillDiscoveryApi {
  /** `GET /agent-skills`: one configured repository's skills and plugins. */
  discover(repoUrl: string): Promise<SkillRepositoryDiscovery>;
  /** `GET /agent-skills/content`: a skill's SKILL.md and its file list. */
  readSkill(skill: SkillAt): Promise<SkillContent>;
  /** `GET /agent-skills/content/file`: one file of a skill. */
  readSkillFile(skill: SkillAt, file: string): Promise<SkillFileContent>;
}

export const skillDiscoveryApiRef = createApiRef<SkillDiscoveryApi>({
  id: 'plugin.agent-platform.skill-discovery',
});

/**
 * The reason a failed skill read gives (gs-backend's `{error: {message}}`),
 * else `fallback` with the HTTP status.
 */
export async function skillReadError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const reason = await response
    .json()
    .then((body: { error?: { message?: unknown } }) => body?.error?.message)
    .catch(() => undefined);
  return new Error(
    typeof reason === 'string' && reason
      ? reason
      : `${fallback}: HTTP ${response.status}`,
  );
}

/** {@link SkillDiscoveryApi} over gs-backend, as the signed-in person. */
export class SkillDiscoveryClient implements SkillDiscoveryApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(deps: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = deps.discoveryApi;
    this.fetchApi = deps.fetchApi;
  }

  private async get(path: string, params: URLSearchParams, fallback: string) {
    const baseUrl = await this.discoveryApi.getBaseUrl('gs');
    const response = await this.fetchApi.fetch(
      `${baseUrl}${path}?${params.toString()}`,
    );
    if (!response.ok) {
      throw await skillReadError(response, fallback);
    }
    return response.json();
  }

  async discover(repoUrl: string): Promise<SkillRepositoryDiscovery> {
    return this.get(
      '/agent-skills',
      new URLSearchParams({ repoUrl }),
      `Failed to discover skills in ${repoUrl}`,
    );
  }

  async readSkill({ repoUrl, path, commit, ref }: SkillAt) {
    return this.get(
      '/agent-skills/content',
      new URLSearchParams({ repoUrl, path, commit, ref }),
      'Could not read the skill',
    );
  }

  async readSkillFile({ repoUrl, path, commit, ref }: SkillAt, file: string) {
    const params = new URLSearchParams({ repoUrl, path, commit });
    if (ref) {
      params.set('ref', ref);
    }
    params.set('file', file);
    return this.get(
      '/agent-skills/content/file',
      params,
      'Could not read the file',
    );
  }
}
