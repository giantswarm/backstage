import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { baseDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import { MODEL_MANAGER_SERVER } from '../../lib/modelManagerBackends';
import type { TryServedModelResult } from '../ModelManagerApi';
import { ModelManagerApiClient } from '../ModelManagerApiClient';
import { served } from './fixtureIdentity';
import { modelManagerFixtureServer } from './mcpServers/modelManager';
import {
  modelHostingFixtureState,
  type ModelHostingFixtureState,
} from './modelHostingFixtureState';
import { notInFixtures } from './notInFixtures';

/**
 * The installation's muster as model-manager's calls reach it: a served
 * installation whose muster answers, else what muster-backend refuses.
 */
function reachable(installation: string | undefined): string {
  const target = installation ?? '';
  served(target);
  if (
    baseDataSet().installations.some(
      i => i.name === target && i.state === 'unreachable',
    )
  ) {
    throw Object.assign(
      new Error(
        `${target} did not answer: not reachable from this portal (timeout)`,
      ),
      { name: 'ServiceUnavailableError', status: 503 },
    );
  }
  return target;
}

/**
 * model-manager in fixture mode (`agentPlatform.fixtures: true`): the real
 * client, whose every method is one model-manager tool call, over the
 * fixture model-manager server rather than muster, so its answers are parsed
 * and its refusals classified as the real ones are, from the state the tool
 * calls through the fixture `MusterApi` share (`modelHostingFixtureState`):
 * a KServe and an Ollama backend per installation. Only `tryModel`, which
 * the portal's backend carries out, is answered here: 401 without a token,
 * the model's answer with one.
 */
export class ModelManagerFixtureApi extends ModelManagerApiClient {
  private readonly state: () => ModelHostingFixtureState;

  constructor(
    options: {
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
      kubernetesApi: KubernetesApi;
      kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
    },
    state: () => ModelHostingFixtureState = modelHostingFixtureState,
  ) {
    const server: FixtureMcpServer = modelManagerFixtureServer(state);
    const prefix = `x_${MODEL_MANAGER_SERVER}_`;
    super({
      ...options,
      musterApi: {
        async callTool(name, args, installation) {
          const target = reachable(installation);
          const handler = name.startsWith(prefix)
            ? server.tools[name.slice(prefix.length)]
            : undefined;
          if (!handler) {
            throw notInFixtures(`the tool ${name}`);
          }
          return handler(args, { installation: target });
        },
      },
    });
    this.state = state;
  }

  async tryModel(
    installation: string,
    request: { model: string; url: string },
  ): Promise<TryServedModelResult> {
    const target = reachable(installation);
    const { loaded } = this.state().listLoaded(target) as {
      loaded: { name: string; status?: string }[];
    };
    const ready = loaded.some(
      m => m.name === request.model && m.status === 'Ready',
    );
    return {
      url: `${request.url.replace(/\/$/, '')}/chat/completions`,
      model: request.model,
      without: { status: 401, error: 'missing or invalid bearer token' },
      with: ready
        ? {
            status: 200,
            content: `Hello! I am ${request.model}, served on ${target}. How can I help?`,
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
