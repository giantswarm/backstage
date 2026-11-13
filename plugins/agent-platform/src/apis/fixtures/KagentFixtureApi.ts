import type {
  A2aTaskWire,
  KagentSession,
  KagentSessionDetail,
  ModelCostResponse,
  SessionStatesResponse,
  SessionUsageResponse,
} from '@giantswarm/backstage-plugin-agent-platform-common';

import type {
  KagentApi,
  KagentIdentity,
  KagentInstallation,
  RawSessionBodies,
  StreamEnd,
} from '../types';
import { FIXTURE_INSTALLATION, FIXTURE_USER } from './fixtureIdentity';
import { notInFixtures } from './notInFixtures';

/**
 * kagent in fixture mode (`agentPlatform.fixtures: true`): one reachable
 * installation, the fixture user signed in, no sessions yet. Writes and
 * streams fail with {@link notInFixtures} until the fixtures answer them.
 */
export class KagentFixtureApi implements KagentApi {
  async listInstallations(): Promise<KagentInstallation[]> {
    return [{ name: FIXTURE_INSTALLATION, reachable: true }];
  }

  async listSessions(): Promise<KagentSession[]> {
    return [];
  }

  async listSessionsIfComplete(): Promise<KagentSession[] | undefined> {
    return [];
  }

  async getSessionDetail(): Promise<KagentSessionDetail | undefined> {
    return undefined;
  }

  async listSessionTasks(): Promise<A2aTaskWire[]> {
    return [];
  }

  async getRawSession(): Promise<RawSessionBodies> {
    return { sessionBody: null, tasksBody: null };
  }

  async listSessionStates(): Promise<SessionStatesResponse> {
    return { evaluatedAt: Date.now(), states: [], unreadable: [], skipped: 0 };
  }

  async getSessionUsage(): Promise<SessionUsageResponse> {
    const now = Date.now();
    const windowDays = 30;
    return {
      evaluatedAt: now,
      windowStart: now - windowDays * 24 * 60 * 60 * 1000,
      windowDays,
      totals: {
        sessions: 0,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCalls: 0,
      },
      daily: [],
      byAgent: [],
      topTools: [],
      otherTools: { count: 0, calls: 0 },
      topMcpServers: [],
      otherMcpServers: { count: 0, calls: 0 },
      undatedTurns: 0,
      unreadable: [],
      skipped: 0,
    };
  }

  async getModelCost(
    _installation: string,
    days: number,
  ): Promise<ModelCostResponse> {
    return {
      status: 'actual',
      windowDays: days,
      totalUsd: 0,
      byAgent: [],
      partial: false,
      evaluatedAt: Date.now(),
    };
  }

  async cancelTask(): Promise<void> {
    throw notInFixtures('kagent cancelTask');
  }

  async deleteSession(): Promise<void> {
    throw notInFixtures('kagent deleteSession');
  }

  async renameSession(): Promise<void> {
    throw notInFixtures('kagent renameSession');
  }

  async sendMessage(): Promise<void> {
    throw notInFixtures('kagent sendMessage');
  }

  async streamMessage(): Promise<StreamEnd> {
    throw notInFixtures('kagent streamMessage');
  }

  async answerConfirmation(): Promise<void> {
    throw notInFixtures('kagent answerConfirmation');
  }

  async streamAnswer(): Promise<StreamEnd> {
    throw notInFixtures('kagent streamAnswer');
  }

  async subscribeToTask(): Promise<StreamEnd> {
    throw notInFixtures('kagent subscribeToTask');
  }

  async getIdentity(): Promise<KagentIdentity> {
    return { sub: FIXTURE_USER.sub, email: FIXTURE_USER.email };
  }

  async listAgentNamespaces(): Promise<string[]> {
    return [];
  }
}
