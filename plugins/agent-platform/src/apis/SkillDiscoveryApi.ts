import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
  OAuthApi,
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
  /** When the listing was read upstream (ISO time); absent from older backends. */
  readAt?: string;
  /** True when an older listing is served because the upstream read failed. */
  stale?: boolean;
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
 * The header the person's GitHub access token travels in to the gs-backend
 * route. Mirrors `GITHUB_TOKEN_HEADER` in
 * plugins/gs-backend/src/agentSkills/createSkillPullRequest.ts — a backend
 * constant cannot be imported here.
 */
const GITHUB_TOKEN_HEADER = 'gs-github-token';

/** What the Add-skill (or Edit-skill) form submits. */
export type ProposedSkill = {
  /** One of the configured skill repositories. */
  repoUrl: string;
  /** The skill's frontmatter name (lowercase slug); a new skill's directory. */
  skillName: string;
  /** Frontmatter `description`. */
  description: string;
  /** The SKILL.md body under the frontmatter. */
  instructions: string;
  /**
   * Frontmatter `metadata.tags`: replaces the skill's tags (`[]` removes
   * them). Absent keeps an edited skill's tags as they are.
   */
  tags?: string[];
  /**
   * `update` rewrites an existing skill's SKILL.md (on
   * `update-skill/<directory as a slug>`; the repo name for a root skill)
   * instead of adding `<name>/SKILL.md`; absent means a new skill.
   */
  kind?: 'update';
  /** For an update: the skill's directory ('' at the repository root). */
  path?: string;
  /** For an update: the commit the edit started from. */
  baseCommit?: string;
};

/** The pull request the backend opened, as the route answers it. */
export type SkillPullRequest = {
  pullRequestUrl: string;
  number: number;
  branch: string;
  base: string;
  path: string;
};

/** The slugs the backend accepts as a skill name; mirrored for the form. */
export const SKILL_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Where a proposal's target is checked: an installation's skill-manager
 * sources, as the person (their muster headers, asked for only when the
 * proposal is sent). Absent, the portal's configured repositories.
 */
export type SkillProposalVia = {
  installation: string;
  authHeaders: () => Promise<Record<string, string>>;
};

/**
 * gs-backend's skill routes: the reads of the skill repositories in
 * `agentPlatform.skills.repositories` (the portal's own skill source, where an
 * installation has no skill-manager), and the pull request that proposes a
 * skill to any source. Each failure is an `Error` in the backend's words.
 */
export interface SkillDiscoveryApi {
  /** `GET /agent-skills`: one configured repository's skills and plugins. */
  discover(repoUrl: string): Promise<SkillRepositoryDiscovery>;
  /** `GET /agent-skills/content`: a skill's SKILL.md and its file list. */
  readSkill(skill: SkillAt): Promise<SkillContent>;
  /** `GET /agent-skills/content/file`: one file of a skill. */
  readSkillFile(skill: SkillAt, file: string): Promise<SkillFileContent>;
  /**
   * `POST /agent-skills/pull-request`: proposes a new or changed skill as a
   * pull request opened as the signed-in person, with their own GitHub token.
   */
  proposeSkill(
    skill: ProposedSkill,
    via?: SkillProposalVia,
  ): Promise<SkillPullRequest>;
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

/** A skill's query parameters; `ref` only when it names one. */
function skillParams({ repoUrl, path, commit, ref }: SkillAt): URLSearchParams {
  const params = new URLSearchParams({ repoUrl, path, commit });
  if (ref) {
    params.set('ref', ref);
  }
  return params;
}

/** {@link SkillDiscoveryApi} over gs-backend, as the signed-in person. */
export class SkillDiscoveryClient implements SkillDiscoveryApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly githubAuthApi: OAuthApi;

  constructor(deps: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    githubAuthApi: OAuthApi;
  }) {
    this.discoveryApi = deps.discoveryApi;
    this.fetchApi = deps.fetchApi;
    this.githubAuthApi = deps.githubAuthApi;
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

  async readSkill(skill: SkillAt): Promise<SkillContent> {
    return this.get(
      '/agent-skills/content',
      skillParams(skill),
      'Could not read the skill',
    );
  }

  async readSkillFile(skill: SkillAt, file: string): Promise<SkillFileContent> {
    const params = skillParams(skill);
    params.set('file', file);
    return this.get(
      '/agent-skills/content/file',
      params,
      'Could not read the file',
    );
  }

  async proposeSkill(
    skill: ProposedSkill,
    via?: SkillProposalVia,
  ): Promise<SkillPullRequest> {
    // The person's own token: the branch and the pull request name them,
    // not a bot. Scope `repo` is what the portal's GitHub grant asks for.
    const token = await this.githubAuthApi.getAccessToken('repo');
    const baseUrl = await this.discoveryApi.getBaseUrl('gs');
    // From skill-manager, gs-backend checks the target against the
    // installation's sources as the person, through their muster token.
    const response = await this.fetchApi.fetch(
      `${baseUrl}/agent-skills/pull-request`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [GITHUB_TOKEN_HEADER]: token,
          ...(via ? await via.authHeaders() : {}),
        },
        body: JSON.stringify(
          via ? { ...skill, installation: via.installation } : skill,
        ),
      },
    );
    if (!response.ok) {
      throw await skillReadError(response, 'Could not open the pull request');
    }
    return (await response.json()) as SkillPullRequest;
  }
}
