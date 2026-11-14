import { ResponseError } from '@backstage/errors';

import type {
  CredentialOperationRead,
  CredentialResourceResult,
  CredentialValue,
} from '../../lib/credentialOperations';
import type { AgentManagerCredentialsApi } from '../AgentManagerCredentialsApi';
import {
  agentManagerFixtureState,
  CredentialRefusal,
  type AgentManagerFixtureState,
} from './agentManagerFixtureState';
import { served } from './fixtureIdentity';

/**
 * A refusal as the real client throws it: a `ResponseError` whose body
 * carries agent-manager's code, as the portal's backend relays it.
 */
async function responseErrorOf(refusal: CredentialRefusal): Promise<Error> {
  const body = JSON.stringify({
    error: { name: 'Error', message: refusal.message, code: refusal.code },
    response: { statusCode: refusal.status },
  });
  return ResponseError.fromResponse({
    ok: false,
    status: refusal.status,
    statusText: refusal.code,
    url: 'fixture:credential-operations',
    redirected: false,
    type: 'basic',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? 'application/json' : null,
    },
    text: async () => body,
  } as Parameters<typeof ResponseError.fromResponse>[0]);
}

async function answer<T>(call: () => T): Promise<T> {
  try {
    // A copy, as an HTTP answer is: no caller shares the state's objects.
    const value = call();
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw error instanceof CredentialRefusal
      ? await responseErrorOf(error)
      : error;
  }
}

/**
 * agent-manager's credential operations in fixture mode
 * (`agentPlatform.fixtures: true`): the operations the fixture agent-manager's
 * organization tools prepared (`agentManagerFixtureState`). A save writes
 * what the operation prepared, in memory, until the page reloads.
 */
export class AgentManagerCredentialsFixtureApi implements AgentManagerCredentialsApi {
  constructor(
    private readonly state: AgentManagerFixtureState = agentManagerFixtureState(),
  ) {}

  async getOperation(
    installation: string,
    operation: string,
  ): Promise<CredentialOperationRead> {
    served(installation);
    return answer(() => this.state.getOperation(installation, operation));
  }

  async saveOperation(
    installation: string,
    operation: string,
    etag: string,
    values: CredentialValue[],
  ): Promise<CredentialResourceResult> {
    served(installation);
    return answer(() =>
      this.state.saveOperation(
        installation,
        operation,
        etag,
        JSON.parse(JSON.stringify(values)),
      ),
    );
  }

  async cancelOperation(
    installation: string,
    operation: string,
    etag: string,
  ): Promise<void> {
    served(installation);
    return answer(() =>
      this.state.cancelOperation(installation, operation, etag),
    );
  }
}
