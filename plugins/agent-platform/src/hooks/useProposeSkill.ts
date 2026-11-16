import { useApi } from '@backstage/core-plugin-api';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  skillDiscoveryApiRef,
  type ProposedSkill,
  type SkillPullRequest,
} from '../apis/SkillDiscoveryApi';
import { unreachableError } from '../lib/skillManager';
import { useSkillSource } from './useSkillSource';

export {
  SKILL_NAME_RE,
  type ProposedSkill,
  type SkillPullRequest,
} from '../apis/SkillDiscoveryApi';

/**
 * Proposes a new skill — or, with `kind: 'update'`, a change to an existing
 * one — to one of the configured skill repositories, as a pull request opened
 * **as the signed-in person**: their GitHub token is minted
 * through `githubAuthApiRef` by the `SkillDiscoveryApi` (their own GitHub grant in muster — a person
 * without a grant is bounced through muster's connect once and comes back
 * here) and travels to gs-backend's `POST /agent-skills/pull-request`, which
 * creates the branch, puts the SKILL.md and opens the PR. Nothing deploys:
 * the skill joins the catalog once a teammate merges.
 */
export function useProposeSkill(installation?: string) {
  const skillDiscoveryApi = useApi(skillDiscoveryApiRef);
  const source = useSkillSource(installation);

  const mutation = useTrackedMutation({
    event: (_pr, skill) => ({
      name: 'AgentPlatform.skillProposed',
      attributes: { kind: skill.kind === 'update' ? 'updated' : 'created' },
    }),
    mutationFn: async (skill: ProposedSkill): Promise<SkillPullRequest> => {
      if (source.kind === 'unreachable') {
        throw unreachableError(source.installation);
      }
      if (source.kind === 'pending') {
        throw new Error(
          'Still reading where this installation keeps its skills; try again in a moment.',
        );
      }
      return skillDiscoveryApi.proposeSkill(
        skill,
        source.kind === 'skill-manager'
          ? {
              installation: source.installation,
              authHeaders: () => source.client.authHeaders(),
            }
          : undefined,
      );
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
