import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  skillDiscoveryApiRef,
  type SkillContent,
} from '../apis/SkillDiscoveryApi';
import type { DiscoveredSkill } from '../lib/skills';
import { unreachableError } from '../lib/skillManager';
import { useSkillSource } from './useSkillSource';

export type { SkillContent } from '../apis/SkillDiscoveryApi';

/**
 * Reads a skill's current SKILL.md — frontmatter `name`/`description` and the
 * body — at the commit the catalog pinned it to, through gs-backend's
 * `GET /agent-skills/content` (configured repositories only). What a skill
 * edit is prefilled with. Content at a commit never changes, so it is read
 * once; a refusal (the file gone, the branch moved on) is not retried.
 */
export function useSkillContent(
  skill:
    Pick<DiscoveredSkill, 'repoUrl' | 'path' | 'commit' | 'ref'> | undefined,
  installation?: string,
) {
  const skillDiscoveryApi = useApi(skillDiscoveryApiRef);
  const source = useSkillSource(installation);
  const sourceKey =
    source.kind === 'skill-manager' ? source.installation : source.kind;

  const { data, error, isPending } = useQuery({
    queryKey: [
      'agent-platform',
      'skill-content',
      sourceKey,
      skill?.repoUrl,
      skill?.path,
      skill?.commit,
    ],
    enabled:
      Boolean(skill) &&
      source.kind !== 'pending' &&
      source.kind !== 'unreachable',
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<SkillContent> => {
      const { repoUrl, path, commit, ref } = skill!;
      if (source.kind === 'skill-manager') {
        return source.client.getSkill({ repoUrl, path, commit });
      }
      return skillDiscoveryApi.readSkill({ repoUrl, path, commit, ref });
    },
  });

  return {
    content: data,
    isLoading: Boolean(skill) && source.kind !== 'unreachable' && isPending,
    error:
      source.kind === 'unreachable'
        ? unreachableError(source.installation)
        : (error as Error | null),
  };
}
