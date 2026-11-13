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
import { FIXTURE_INSTALLATION, FIXTURE_USER, served } from './fixtureIdentity';
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

  async listSessions(installation: string): Promise<KagentSession[]> {
    served(installation);
    return [];
  }

  async listSessionsIfComplete(
    installation: string,
  ): Promise<KagentSession[] | undefined> {
    served(installation);
    return [];
  }

  async getSessionDetail(
    installation: string,
  ): Promise<KagentSessionDetail | undefined> {
    served(installation);
    return undefined;
  }

  async listSessionTasks(installation: string): Promise<A2aTaskWire[]> {
    served(installation);
    return [];
  }

  async getRawSession(installation: string): Promise<RawSessionBodies> {
    served(installation);
    return { sessionBody: null, tasksBody: null };
  }

  async listSessionStates(
    installation: string,
  ): Promise<SessionStatesResponse> {
    served(installation);
    return { evaluatedAt: Date.now(), states: [], unreadable: [], skipped: 0 };
  }

  async getSessionUsage(installation: string): Promise<SessionUsageResponse> {
    served(installation);
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
    installation: string,
    days: number,
  ): Promise<ModelCostResponse> {
    served(installation);
    return {
      status: 'actual',
      windowDays: days,
      totalUsd: 0,
      byAgent: [],
      partial: false,
      evaluatedAt: Date.now(),
    };
  }

  async cancelTask(installation: string): Promise<void> {
    served(installation);
    throw notInFixtures('kagent cancelTask');
  }

  async deleteSession(installation: string): Promise<void> {
    served(installation);
    throw notInFixtures('kagent deleteSession');
  }

  async renameSession(installation: string): Promise<void> {
    served(installation);
    throw notInFixtures('kagent renameSession');
  }

  async sendMessage(installation: string): Promise<void> {
    served(installation);
    throw notInFixtures('kagent sendMessage');
  }

  async streamMessage(installation: string): Promise<StreamEnd> {
    served(installation);
    throw notInFixtures('kagent streamMessage');
  }

  async answerConfirmation(installation: string): Promise<void> {
    served(installation);
    throw notInFixtures('kagent answerConfirmation');
  }

  async streamAnswer(installation: string): Promise<StreamEnd> {
    served(installation);
    throw notInFixtures('kagent streamAnswer');
  }

  async subscribeToTask(installation: string): Promise<StreamEnd> {
    served(installation);
    throw notInFixtures('kagent subscribeToTask');
  }

  async getIdentity(installation: string): Promise<KagentIdentity> {
    served(installation);
    return { sub: FIXTURE_USER.sub, email: FIXTURE_USER.email };
  }

  async listAgentNamespaces(installation: string): Promise<string[]> {
    served(installation);
    return [];
  }
}
