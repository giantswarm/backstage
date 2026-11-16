import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- model-manager's tools are called through muster.
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import type { TryServedModelResult } from '../ModelManagerApi';
import { ModelManagerApiClient } from '../ModelManagerApiClient';
import { served } from './fixtureIdentity';
import {
  modelHostingFixtureState,
  type ModelHostingFixtureState,
} from './modelHostingFixtureState';

/**
 * model-manager in fixture mode (`agentPlatform.fixtures: true`): the real
 * client, whose every method is one model-manager tool call through muster,
 * so the inventory and the serving tools go through the same muster — the
 * fixture `MusterApi` with `muster.fixtures`, which answers them from the
 * state the fixture model-manager server keeps (`modelHostingFixtureState`).
 * Only `tryModel`, which the portal's backend carries out, is answered here:
 * 401 without a token, the model's answer with one.
 */
export class ModelManagerFixtureApi extends ModelManagerApiClient {
  private readonly state: () => ModelHostingFixtureState;

  constructor(
    options: {
      musterApi: Pick<MusterApi, 'callTool'>;
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
      kubernetesApi: KubernetesApi;
      kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
    },
    state: () => ModelHostingFixtureState = modelHostingFixtureState,
  ) {
    super(options);
    this.state = state;
  }

  async tryModel(
    installation: string,
    request: { model: string; url: string },
  ): Promise<TryServedModelResult> {
    served(installation);
    const answer = this.state().tryModel(installation, request.model);
    return {
      url: `${request.url.replace(/\/$/, '')}/chat/completions`,
      model: request.model,
      without: { status: 401, error: 'missing or invalid bearer token' },
      with: answer.ready
        ? {
            status: 200,
            content: `Hello! I am ${request.model}, served on ${installation}. How can I help?`,
            latencyMs: 640,
          }
        : {
            status: 503,
            error: `no healthy upstream for ${request.model}`,
            latencyMs: 12,
          },
    };
  }
}
