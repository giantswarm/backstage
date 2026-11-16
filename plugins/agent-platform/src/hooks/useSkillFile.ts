import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { skillDiscoveryApiRef } from '../apis/SkillDiscoveryApi';
import type { DiscoveredSkill, SkillFileContent } from '../lib/skills';
import { unreachableError } from '../lib/skillManager';
import { useSkillSource } from './useSkillSource';

/**
 * Reads one file of a skill at the commit the catalog pinned it to, through
 * gs-backend's `GET /agent-skills/content/file` — the Instructions tab's
 * viewer. `file` is relative to the skill directory and must be one the
 * skill's listing names (`useSkillContent`'s `files`); undefined reads
 * nothing. A file at a commit never changes, so each is read once per page
 * life (`staleTime: Infinity`, the backend answers `immutable` too); a
 * refusal is not retried. `ref` goes along for generic-git repositories,
 * whose reads check the branch still points at the commit.
 */
export function useSkillFile(
  skill:
    Pick<DiscoveredSkill, 'repoUrl' | 'path' | 'commit' | 'ref'> | undefined,
  file: string | undefined,
  installation?: string,
) {
  const skillDiscoveryApi = useApi(skillDiscoveryApiRef);
  const source = useSkillSource(installation);
  const sourceKey =
    source.kind === 'skill-manager' ? source.installation : source.kind;
  const enabled =
    Boolean(skill && file) &&
    source.kind !== 'pending' &&
    source.kind !== 'unreachable';

  const { data, error, isPending } = useQuery({
    queryKey: [
      'agent-platform',
      'skill-file',
      sourceKey,
      skill?.repoUrl,
      skill?.path,
      skill?.commit,
      file,
    ],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<SkillFileContent> => {
      const { repoUrl, path, commit, ref } = skill!;
      if (source.kind === 'skill-manager') {
        return source.client.getSkillFile({ repoUrl, path, commit }, file!);
      }
      return skillDiscoveryApi.readSkillFile(
        { repoUrl, path, commit, ref },
        file!,
      );
    },
  });

  return {
    file: data,
    isLoading: enabled && isPending,
    error:
      source.kind === 'unreachable'
        ? unreachableError(source.installation)
        : (error as Error | null),
  };
}
