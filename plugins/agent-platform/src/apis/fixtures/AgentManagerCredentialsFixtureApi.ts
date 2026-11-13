import type {
  CredentialOperationRead,
  CredentialResourceResult,
} from '../../lib/credentialOperations';
import type { AgentManagerCredentialsApi } from '../AgentManagerCredentialsApi';
import { served } from './fixtureIdentity';
import { notInFixtures } from './notInFixtures';

/**
 * agent-manager's credential operations in fixture mode
 * (`agentPlatform.fixtures: true`). No tool prepares an operation yet, so
 * every call fails with {@link notInFixtures}.
 */
export class AgentManagerCredentialsFixtureApi implements AgentManagerCredentialsApi {
  async getOperation(installation: string): Promise<CredentialOperationRead> {
    served(installation);
    throw notInFixtures('agent-manager getOperation');
  }

  async saveOperation(installation: string): Promise<CredentialResourceResult> {
    served(installation);
    throw notInFixtures('agent-manager saveOperation');
  }

  async cancelOperation(installation: string): Promise<void> {
    served(installation);
    throw notInFixtures('agent-manager cancelOperation');
  }
}
