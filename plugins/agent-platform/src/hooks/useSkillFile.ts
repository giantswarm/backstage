import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import type { DiscoveredSkill, SkillFileContent } from '../lib/skills';
import { skillReadError } from './useSkillContent';

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
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const enabled = Boolean(skill && file);

  const { data, error, isPending } = useQuery({
    queryKey: [
      'agent-platform',
      'skill-file',
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
      const baseUrl = await discoveryApi.getBaseUrl('gs');
      const params = new URLSearchParams({ repoUrl, path, commit });
      if (ref) {
        params.set('ref', ref);
      }
      params.set('file', file!);
      const response = await fetchApi.fetch(
        `${baseUrl}/agent-skills/content/file?${params.toString()}`,
      );
      if (!response.ok) {
        throw await skillReadError(response, 'Could not read the file');
      }
      return (await response.json()) as SkillFileContent;
    },
  });

  return {
    file: data,
    isLoading: enabled && isPending,
    error: error as Error | null,
  };
}
