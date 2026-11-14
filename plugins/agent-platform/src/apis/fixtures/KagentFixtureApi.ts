import type {
  A2aTaskWire,
  KagentSession,
  KagentSessionDetail,
  ModelCostResponse,
  SessionStatesResponse,
  SessionUsageResponse,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { baseDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type {
  ConfirmationAnswerRequest,
  KagentApi,
  KagentIdentity,
  KagentInstallation,
  OutboundMessage,
  RawSessionBodies,
  StreamEnd,
} from '../types';

import { agentManagerFixtureState } from './agentManagerFixtureState';
import { FIXTURE_USER, served } from './fixtureIdentity';
import {
  kagentFixtureState,
  type KagentFixtureState,
} from './kagentFixtureState';

type Agent = { namespace: string; name: string };

/**
 * kagent in fixture mode (`agentPlatform.fixtures: true`): the installations
 * of the base data set, the fixture user signed in, and each installation's
 * sessions with their conversations from `KagentFixtureState` (shared with
 * agent-manager's `start_session`, which creates sessions in it). Answers
 * cross as JSON, as over HTTP, so no page shares the fixture's objects.
 */
export class KagentFixtureApi implements KagentApi {
  constructor(
    private readonly state: () => KagentFixtureState = kagentFixtureState,
  ) {}

  async listInstallations(): Promise<KagentInstallation[]> {
    const reachable = {
      reachable: true,
      unreachable: false,
      unknown: 'unknown',
    } as const;
    return baseDataSet().installations.map(installation => ({
      name: installation.name,
      reachable: reachable[installation.state],
      ...(installation.state === 'unreachable' && { reason: 'timeout' }),
    }));
  }

  async listSessions(installation: string): Promise<KagentSession[]> {
    served(installation);
    return this.state().listSessions(installation);
  }

  async listSessionsIfComplete(
    installation: string,
  ): Promise<KagentSession[] | undefined> {
    served(installation);
    return this.state().listSessions(installation);
  }

  async getSessionDetail(
    installation: string,
    sessionId: string,
  ): Promise<KagentSessionDetail | undefined> {
    served(installation);
    return this.state().getSessionDetail(installation, sessionId);
  }

  async listSessionTasks(
    installation: string,
    sessionId: string,
  ): Promise<A2aTaskWire[]> {
    served(installation);
    return this.state().listSessionTasks(installation, sessionId);
  }

  async getRawSession(
    installation: string,
    sessionId: string,
  ): Promise<RawSessionBodies> {
    served(installation);
    return this.state().getRawSession(installation, sessionId);
  }

  async listSessionStates(
    installation: string,
  ): Promise<SessionStatesResponse> {
    served(installation);
    return this.state().listSessionStates(installation);
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

  async cancelTask(
    installation: string,
    sessionId: string,
    taskId: string,
  ): Promise<void> {
    served(installation);
    this.state().cancelTask(installation, sessionId, taskId);
  }

  async deleteSession(installation: string, sessionId: string): Promise<void> {
    served(installation);
    this.state().deleteSession(installation, sessionId);
  }

  async renameSession(
    installation: string,
    sessionId: string,
    name: string,
  ): Promise<void> {
    served(installation);
    this.state().renameSession(installation, sessionId, name);
  }

  async sendMessage(
    installation: string,
    sessionId: string,
    agent: Agent,
    message: OutboundMessage,
  ): Promise<void> {
    served(installation);
    this.state().sendMessage(installation, sessionId, agent, message);
  }

  async streamMessage(
    installation: string,
    sessionId: string,
    agent: Agent,
    message: OutboundMessage,
    onEvent: (result: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd> {
    served(installation);
    return this.state().streamMessage(
      installation,
      sessionId,
      agent,
      message,
      onEvent,
      signal,
    );
  }

  async answerConfirmation(
    installation: string,
    sessionId: string,
    agent: Agent,
    answer: ConfirmationAnswerRequest,
  ): Promise<void> {
    served(installation);
    this.state().answerConfirmation(installation, sessionId, agent, answer);
  }

  async streamAnswer(
    installation: string,
    sessionId: string,
    agent: Agent,
    answer: ConfirmationAnswerRequest,
    onEvent: (result: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd> {
    served(installation);
    return this.state().streamAnswer(
      installation,
      sessionId,
      agent,
      answer,
      onEvent,
      signal,
    );
  }

  async subscribeToTask(
    installation: string,
    sessionId: string,
    _agent: Agent,
    taskId: string,
    onEvent: (result: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd> {
    served(installation);
    return this.state().subscribeToTask(
      installation,
      sessionId,
      taskId,
      onEvent,
      signal,
    );
  }

  async getIdentity(installation: string): Promise<KagentIdentity> {
    served(installation);
    return { sub: FIXTURE_USER.sub, email: FIXTURE_USER.email };
  }

  async listAgentNamespaces(installation: string): Promise<string[]> {
    served(installation);
    return agentManagerFixtureState().agentNamespaces(installation);
  }
}
