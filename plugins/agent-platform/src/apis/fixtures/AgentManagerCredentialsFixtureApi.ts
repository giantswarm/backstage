import type {
  CredentialOperationRead,
  CredentialResourceResult,
} from '../../lib/credentialOperations';
import type { AgentManagerCredentialsApi } from '../AgentManagerCredentialsApi';
import { notInFixtures } from './notInFixtures';

/**
 * agent-manager's credential operations in fixture mode
 * (`agentPlatform.fixtures: true`). No tool prepares an operation yet, so
 * every call fails with {@link notInFixtures}.
 */
export class AgentManagerCredentialsFixtureApi implements AgentManagerCredentialsApi {
  async getOperation(): Promise<CredentialOperationRead> {
    throw notInFixtures('agent-manager getOperation');
  }

  async saveOperation(): Promise<CredentialResourceResult> {
    throw notInFixtures('agent-manager saveOperation');
  }

  async cancelOperation(): Promise<void> {
    throw notInFixtures('agent-manager cancelOperation');
  }
}
