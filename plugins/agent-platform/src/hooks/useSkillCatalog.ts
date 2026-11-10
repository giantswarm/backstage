import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import { DiscoveredSkill } from '../lib/skills';
import type { DiscoveredPlugin } from '../lib/plugins';
import { catalogFromSkillManager, unreachableError } from '../lib/skillManager';
import { useSkillSource } from './useSkillSource';

export type SkillCatalog = {
  skills: DiscoveredSkill[];
  /** The plugins found in the same repositories, at the same commits. */
  plugins: DiscoveredPlugin[];
  isLoading: boolean;
  error: Error | null;
  /**
   * Whether any skill repository is configured at all; true until the
   * source has answered, since the wizard decides on its skills step by it.
   */
  hasRepositories: boolean;
  /** Configured repositories whose discovery failed (surfaced as a warning). */
  failedRepositories: string[];
  /** Why each failed repository could not be read, by its URL. */
  failureMessages?: Record<string, string>;
  /** True when a repo's listing was capped, so some skills may be missing. */
  truncated: boolean;
};

/**
 * The skills and plugins an agent on `installation` (default: the portal's
 * home installation) can use: the installation's skill-manager `list_skills`,
 * as the person, so a private repository they cannot read lists no skills
 * and names why. Where skill-manager is not deployed, gs-backend's
 * `/agent-skills` discovery of `agentPlatform.skills.repositories` answers
 * (deprecated). One repository failing does not fail the catalog.
 */
export function useSkillCatalog(installation?: string): SkillCatalog {
  const source = useSkillSource(installation);
  const skillManager = useQuery({
    queryKey: [
      'agent-platform',
      'skill-manager',
      'skills',
      source.kind === 'skill-manager' ? source.installation : '',
    ],
    enabled: source.kind === 'skill-manager',
    queryFn: async () =>
      source.kind === 'skill-manager'
        ? catalogFromSkillManager(await source.client.listSkills())
        : undefined,
    retry: false,
  });
  const portal = usePortalSkillCatalog(source.kind === 'portal');
  if (source.kind === 'pending') {
    return { ...portal, isLoading: true, hasRepositories: true };
  }
  if (source.kind === 'portal') {
    return portal;
  }
  if (source.kind === 'unreachable') {
    return {
      ...portal,
      skills: [],
      plugins: [],
      isLoading: false,
      error: unreachableError(source.installation),
      hasRepositories: true,
    };
  }
  const data = skillManager.data;
  return {
    skills: data?.skills ?? [],
    plugins: data?.plugins ?? [],
    isLoading: isAwaitingData(skillManager),
    error: (skillManager.error as Error) ?? null,
    hasRepositories: data?.hasRepositories ?? true,
    failedRepositories: data?.failedRepositories ?? [],
    failureMessages: data?.failureMessages ?? {},
    truncated: data?.truncated ?? false,
  };
}

/** gs-backend discovery of the configured repositories, when `enabled`. */
function usePortalSkillCatalog(enabled: boolean): SkillCatalog {
  // The repository list is part of the signed-in config; discovery waits for
  // it rather than starting with an empty list.
  const { config, isLoading: configIsLoading } = useSignedInConfig();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const repositories =
    config?.getOptionalStringArray('agentPlatform.skills.repositories') ?? [];

  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey: ['agent-platform', 'skills', repositories.join(',')],
    enabled: enabled && !configIsLoading && repositories.length > 0,
    queryFn: async () => {
      const baseUrl = await discoveryApi.getBaseUrl('gs');

      const perRepo = await Promise.allSettled(
        repositories.map(async repoUrl => {
          const params = new URLSearchParams({ repoUrl });
          const response = await fetchApi.fetch(
            `${baseUrl}/agent-skills?${params.toString()}`,
          );
          if (!response.ok) {
            const reason = await response
              .json()
              .then(
                (body: { error?: { message?: unknown } }) =>
                  body?.error?.message,
              )
              .catch(() => undefined);
            throw new Error(
              typeof reason === 'string' && reason
                ? reason
                : `Failed to discover skills in ${repoUrl}: HTTP ${response.status}`,
            );
          }
          const body = (await response.json()) as {
            skills: DiscoveredSkill[];
            /** Absent from older backends. */
            plugins?: DiscoveredPlugin[];
            truncated?: boolean;
          };
          return body;
        }),
      );

      const skills: DiscoveredSkill[] = [];
      const plugins: DiscoveredPlugin[] = [];
      const failedRepositories: string[] = [];
      const failureMessages: Record<string, string> = {};
      let truncated = false;
      perRepo.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          skills.push(...result.value.skills);
          plugins.push(...(result.value.plugins ?? []));
          truncated = truncated || Boolean(result.value.truncated);
        } else {
          failedRepositories.push(repositories[index]);
          failureMessages[repositories[index]] =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
        }
      });

      return {
        skills,
        plugins,
        failedRepositories,
        failureMessages,
        truncated,
      };
    },
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  return {
    skills: data?.skills ?? [],
    plugins: data?.plugins ?? [],
    isLoading: configIsLoading || isLoading,
    error: (error as Error) ?? null,
    hasRepositories: repositories.length > 0,
    failedRepositories: data?.failedRepositories ?? [],
    failureMessages: data?.failureMessages ?? {},
    truncated: data?.truncated ?? false,
  };
}
