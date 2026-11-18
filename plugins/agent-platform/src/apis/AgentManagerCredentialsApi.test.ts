import { ResponseError } from '@backstage/errors';
import type {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';

import { PortalSessionEndedError } from '../lib/portalSession';
import { AgentManagerCredentialsClient } from './AgentManagerCredentialsApi';

// The installation token is not what this is about.
jest.mock('../lib/installationOidcToken', () => ({
  getInstallationOidcToken: async () => 'installation-token',
}));

function client(response: Response) {
  return new AgentManagerCredentialsClient({
    discoveryApi: {
      getBaseUrl: async () => 'https://portal/api/agent-platform',
    },
    fetchApi: { fetch: jest.fn(async () => response) },
    kubernetesApi: {} as KubernetesApi,
    kubernetesAuthProvidersApi: {} as KubernetesAuthProvidersApi,
  });
}

function answer(status: number, name: string, message: string) {
  return new Response(
    JSON.stringify({
      error: { name, message },
      request: { method: 'POST', url: '/' },
      response: { statusCode: status },
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('AgentManagerCredentialsClient', () => {
  it('says the session ended when the portal refuses the session token', async () => {
    const error = await client(
      answer(401, 'AuthenticationError', 'Failed user token verification'),
    )
      .saveOperation('gazelle', 'a1'.repeat(24), '"3"', [])
      .catch(e => e);

    expect(error).toBeInstanceOf(PortalSessionEndedError);
    expect(error.cause).toBeInstanceOf(ResponseError);
  });

  it("keeps agent-manager's own refusal as it came", async () => {
    const error = await client(
      answer(401, 'AgentManagerError', 'the token is not for agent-manager'),
    )
      .saveOperation('gazelle', 'a1'.repeat(24), '"3"', [])
      .catch(e => e);

    expect(error).toBeInstanceOf(ResponseError);
  });
});
