import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import type { DiscoveredSkill } from '../lib/skills';

/**
 * One skill's SKILL.md at a commit, split the way the add-skill form edits it.
 * Mirrors `SkillContent` in plugins/gs-backend/src/agentSkills/readSkillContent.ts.
 */
export type SkillContent = {
  repoUrl: string;
  path: string;
  commit: string;
  name: string;
  description: string;
  /** The Markdown body under the frontmatter. */
  instructions: string;
};

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
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const { data, error, isPending } = useQuery({
    queryKey: [
      'agent-platform',
      'skill-content',
      skill?.repoUrl,
      skill?.path,
      skill?.commit,
    ],
    enabled: Boolean(skill),
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<SkillContent> => {
      const { repoUrl, path, commit, ref } = skill!;
      const baseUrl = await discoveryApi.getBaseUrl('gs');
      const params = new URLSearchParams({ repoUrl, path, commit, ref });
      const response = await fetchApi.fetch(
        `${baseUrl}/agent-skills/content?${params.toString()}`,
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
            : `Could not read the skill: HTTP ${response.status}`,
        );
      }
      return (await response.json()) as SkillContent;
    },
  });

  return {
    content: data,
    isLoading: Boolean(skill) && isPending,
    error: error as Error | null,
  };
}
