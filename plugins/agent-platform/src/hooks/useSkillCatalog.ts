import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { DiscoveredSkill } from '../lib/skills';

export type SkillCatalog = {
  skills: DiscoveredSkill[];
  isLoading: boolean;
  error: Error | null;
  /** Whether any skill repository is configured at all. */
  hasRepositories: boolean;
  /** Configured repositories whose discovery failed (surfaced as a warning). */
  failedRepositories: string[];
  /** True when a repo's listing was capped, so some skills may be missing. */
  truncated: boolean;
};

/**
 * Discovers agent skills across every configured repository
 * (`agentPlatform.skills.repositories`) via the gs-backend `/agent-skills`
 * endpoint, and aggregates them. One repository failing does not fail the
 * whole catalog — the others still load and the failed ones are reported.
 */
export function useSkillCatalog(): SkillCatalog {
  const configApi = useApi(configApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const repositories =
    configApi.getOptionalStringArray('agentPlatform.skills.repositories') ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-platform', 'skills', repositories.join(',')],
    enabled: repositories.length > 0,
    queryFn: async () => {
      const baseUrl = await discoveryApi.getBaseUrl('gs');

      const perRepo = await Promise.allSettled(
        repositories.map(async repoUrl => {
          const params = new URLSearchParams({ repoUrl });
          const response = await fetchApi.fetch(
            `${baseUrl}/agent-skills?${params.toString()}`,
          );
          if (!response.ok) {
            throw new Error(
              `Failed to discover skills in ${repoUrl}: HTTP ${response.status}`,
            );
          }
          const body = (await response.json()) as {
            skills: DiscoveredSkill[];
            truncated?: boolean;
          };
          return body;
        }),
      );

      const skills: DiscoveredSkill[] = [];
      const failedRepositories: string[] = [];
      let truncated = false;
      perRepo.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          skills.push(...result.value.skills);
          truncated = truncated || Boolean(result.value.truncated);
        } else {
          failedRepositories.push(repositories[index]);
        }
      });

      return { skills, failedRepositories, truncated };
    },
  });

  return {
    skills: data?.skills ?? [],
    isLoading,
    error: (error as Error) ?? null,
    hasRepositories: repositories.length > 0,
    failedRepositories: data?.failedRepositories ?? [],
    truncated: data?.truncated ?? false,
  };
}
