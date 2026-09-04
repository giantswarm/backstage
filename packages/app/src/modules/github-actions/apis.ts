import {
  ApiBlueprint,
  configApiRef,
  createApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { scmAuthApiRef } from '@backstage/integration-react';
import {
  githubActionsApiRef,
  GithubActionsClient,
} from '@backstage-community/plugin-github-actions';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { getOptionalMainAuthApi } from '../auth/getOptionalMainAuthApi';
import {
  GithubActionsConnection,
  MusterGithubActionsClient,
} from './GithubActionsApiClient';

/**
 * Whether the signed-in person's GitHub is connected in muster for the
 * GitHub Actions tab, and where to connect it. Always connected on a portal
 * that does not run the tab through muster (`githubActions.muster` unset).
 */
export interface GithubActionsConnectionApi {
  getConnection(): Promise<GithubActionsConnection>;
}

export const githubActionsConnectionApiRef =
  createApiRef<GithubActionsConnectionApi>({
    id: 'plugin.github-actions.connection',
  });

/**
 * Replaces the community plugin's Octokit-in-the-browser client with one that
 * asks the github-actions backend, which runs GitHub's actions toolset through
 * muster as the person (`githubActions.muster`). The person's credential is
 * the main login provider's (Dex) ID token, the same one the muster, plans and
 * roadmap plugins forward; no GitHub token reaches the browser. A portal
 * without `githubActions.muster` keeps the community client (ScmAuth).
 */
export const GithubActionsApiOverride = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: githubActionsApiRef,
      deps: {
        configApi: configApiRef,
        scmAuthApi: scmAuthApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        gsAuthProvidersApi: gsAuthProvidersApiRef,
      },
      factory: ({
        configApi,
        scmAuthApi,
        discoveryApi,
        fetchApi,
        gsAuthProvidersApi,
      }) => {
        if (!configApi.getOptionalConfig('githubActions.muster')) {
          return new GithubActionsClient({ configApi, scmAuthApi });
        }
        const mainAuthApi = getOptionalMainAuthApi(gsAuthProvidersApi);
        return new MusterGithubActionsClient({
          discoveryApi,
          fetchApi,
          tokenSource: {
            getToken: async () => {
              if (!mainAuthApi) {
                return undefined;
              }
              try {
                return await mainAuthApi.getIdToken();
              } catch {
                return undefined;
              }
            },
          },
        });
      },
    }),
});

/** The connection check behind the tab's "Connect GitHub" step. */
export const GithubActionsConnectionApi = ApiBlueprint.make({
  name: 'connection',
  params: defineParams =>
    defineParams({
      api: githubActionsConnectionApiRef,
      deps: { githubActionsApi: githubActionsApiRef },
      factory: ({ githubActionsApi }) => ({
        getConnection: async () =>
          githubActionsApi instanceof MusterGithubActionsClient
            ? githubActionsApi.getConnection()
            : { connected: true },
      }),
    }),
});
