import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import type { DiscoveredSkill, SkillFileListing } from '../lib/skills';
import { unreachableError } from '../lib/skillManager';
import { useSkillSource } from './useSkillSource';

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
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
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
      const baseUrl = await discoveryApi.getBaseUrl('gs');
      const params = new URLSearchParams({ repoUrl, path, commit, ref });
      const response = await fetchApi.fetch(
        `${baseUrl}/agent-skills/content?${params.toString()}`,
      );
      if (!response.ok) {
        throw await skillReadError(response, 'Could not read the skill');
      }
      return (await response.json()) as SkillContent;
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
