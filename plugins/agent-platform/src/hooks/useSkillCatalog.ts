import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import {
  canonicalRepoUrl,
  canProposeSkillTo,
  DiscoveredSkill,
} from '../lib/skills';
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
  /**
   * The repositories GitHub reports private, by canonical URL
   * (`canonicalRepoUrl`): only their collaborators read them, and an agent
   * fetches their skills only with a credential.
   */
  privateRepositories: ReadonlySet<string>;
  /**
   * The repositories a new skill can be proposed to: the pull request route
   * accepts a new `<name>/SKILL.md` there and the catalog lists it once merged.
   */
  proposalTargets: string[];
  /** Repositories of the catalog no pull request can go to (not on github.com). */
  unproposableRepositories: string[];
};

const NO_REPOSITORIES: ReadonlySet<string> = new Set();

/** The catalog while its source is unknown or cannot be asked. */
function emptyCatalog(error: Error | null, isLoading: boolean): SkillCatalog {
  return {
    skills: [],
    plugins: [],
    isLoading,
    error,
    hasRepositories: true,
    failedRepositories: [],
    failureMessages: {},
    truncated: false,
    privateRepositories: NO_REPOSITORIES,
    proposalTargets: [],
    unproposableRepositories: [],
  };
}

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
      'json-v1',
    ],
    enabled: source.kind === 'skill-manager',
    queryFn: async () =>
      source.kind === 'skill-manager'
        ? await source.client.listSkills()
        : undefined,
    // Keep the wire answer in the persisted cache; derive Sets only for readers.
    select: listing => listing && catalogFromSkillManager(listing),
    retry: false,
  });
  const portal = usePortalSkillCatalog(source.kind === 'portal');
  if (source.kind === 'pending') {
    return emptyCatalog(null, true);
  }
  if (source.kind === 'portal') {
    return portal;
  }
  if (source.kind === 'unreachable') {
    return emptyCatalog(unreachableError(source.installation), false);
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
    privateRepositories: data?.privateRepositories ?? NO_REPOSITORIES,
    proposalTargets: data?.proposalTargets ?? [],
    unproposableRepositories: [],
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
    // Older cache entries contain a Set serialized as {} and must be refetched.
    queryKey: ['agent-platform', 'skills', repositories.join(','), 'json-v1'],
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
            /** Absent from older backends and for non-GitHub hosts. */
            private?: boolean;
          };
          return body;
        }),
      );

      const skills: DiscoveredSkill[] = [];
      const plugins: DiscoveredPlugin[] = [];
      const failedRepositories: string[] = [];
      const failureMessages: Record<string, string> = {};
      const privateRepositories = new Set<string>();
      let truncated = false;
      perRepo.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          skills.push(...result.value.skills);
          plugins.push(...(result.value.plugins ?? []));
          truncated = truncated || Boolean(result.value.truncated);
          if (result.value.private) {
            privateRepositories.add(canonicalRepoUrl(repositories[index]));
          }
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
        privateRepositories: [...privateRepositories],
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
    privateRepositories: new Set(data?.privateRepositories ?? []),
    proposalTargets: repositories.filter(canProposeSkillTo),
    unproposableRepositories: repositories.filter(
      repoUrl => !canProposeSkillTo(repoUrl),
    ),
  };
}
