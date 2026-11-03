import {
  discoveryApiRef,
  fetchApiRef,
  githubAuthApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

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
 * Proposes a new skill — or, with `kind: 'update'`, a change to an existing
 * one — to one of the configured skill repositories, as a pull request opened
 * **as the signed-in person**: their GitHub token is minted
 * through `githubAuthApiRef` (their own GitHub grant in muster — a person
 * without a grant is bounced through muster's connect once and comes back
 * here) and travels to gs-backend's `POST /agent-skills/pull-request`, which
 * creates the branch, puts the SKILL.md and opens the PR. Nothing deploys:
 * the skill joins the catalog once a teammate merges.
 */
export function useProposeSkill() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const githubAuthApi = useApi(githubAuthApiRef);

  const mutation = useTrackedMutation({
    event: (_pr, skill) => ({
      name: 'AgentPlatform.skillProposed',
      attributes: { kind: skill.kind === 'update' ? 'updated' : 'created' },
    }),
    mutationFn: async (skill: ProposedSkill): Promise<SkillPullRequest> => {
      // The person's own token: the branch and the pull request name them,
      // not a bot. Scope `repo` is what the portal's GitHub grant asks for.
      const token = await githubAuthApi.getAccessToken('repo');
      const baseUrl = await discoveryApi.getBaseUrl('gs');
      const response = await fetchApi.fetch(
        `${baseUrl}/agent-skills/pull-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [GITHUB_TOKEN_HEADER]: token,
          },
          body: JSON.stringify(skill),
        },
      );
      if (!response.ok) {
        const reason = await response
          .json()
          .then(
            (body: { error?: { message?: unknown } }) => body?.error?.message,
          )
          .catch(() => undefined);
        throw new Error(
          typeof reason === 'string' && reason
            ? reason
            : `Could not open the pull request: HTTP ${response.status}`,
        );
      }
      return (await response.json()) as SkillPullRequest;
    },
  });

  return {
    proposeSkill: mutation.mutateAsync,
    isProposing: mutation.isPending,
    error: mutation.error as Error | null,
    result: mutation.data,
    reset: mutation.reset,
  };
}
