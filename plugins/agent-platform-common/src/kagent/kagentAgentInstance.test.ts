import agentInstances from './__fixtures__/agent-instances.kagent-4a91c273.json';
import agentInstance from './__fixtures__/agent-instance.kagent-4a91c273.json';
import v0_10 from './__fixtures__/sessions.v0-10.json';
import {
  encodeKagentAgentId,
  isAgentInstanceEnvelope,
  isAgentInstanceList,
  normalizeAgentInstanceState,
} from './kagentAgentInstance';
import { normalizeSessionDetail } from './kagentSessionDetail';
import {
  isListableSession,
  normalizeSessionList,
  parseCreatedSessionId,
} from './kagentSessions';

describe('AgentInstances as sessions (kagent API v2, recorded on kagent-4a91c273)', () => {
  it('tells a ListAgentInstancesResponse from a 0.10 envelope', () => {
    expect(isAgentInstanceList(agentInstances)).toBe(true);
    expect(isAgentInstanceList(v0_10)).toBe(false);
    expect(isAgentInstanceEnvelope(agentInstance)).toBe(true);
    expect(isAgentInstanceEnvelope({ data: { session: {} } })).toBe(false);
  });

  it('normalizes the listing into sessions with the instance’s own facts', () => {
    const { sessions, drift } = normalizeSessionList(agentInstances, 'lab');

    expect(drift).toBeUndefined();
    expect(sessions).toHaveLength(3);
    const [first] = sessions;
    expect(first).toEqual(
      expect.objectContaining({
        id: `lab/${first.sessionId}`,
        installation: 'lab',
        title: expect.any(String),
        agentTemplate: { namespace: 'kagent', name: expect.any(String) },
        agentId: encodeKagentAgentId('kagent', first.agentTemplate!.name),
        source: 'user',
        state: 'suspended',
        contextId: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    );
    // The lifecycle states come through as words, the failure with its reason.
    expect(sessions.map(s => s.state)).toEqual([
      'suspended',
      'ready',
      'failed',
    ]);
    expect(sessions[2].failure).toEqual(
      expect.objectContaining({ reason: expect.any(String) }),
    );
    // Every instance the controller lists for a caller is theirs to see.
    expect(sessions.every(isListableSession)).toBe(true);
  });

  it('reads the created instance’s id out of the create response', () => {
    expect(parseCreatedSessionId(agentInstance)).toBe(
      agentInstance.agentInstance.id,
    );
    expect(parseCreatedSessionId({ agentInstance: {} })).toBeUndefined();
    expect(parseCreatedSessionId({})).toBeUndefined();
  });

  it('normalizes a one-instance response into a session detail', () => {
    const { detail, drift } = normalizeSessionDetail(agentInstance, 'lab');

    expect(drift).toBeUndefined();
    expect(detail?.session.sessionId).toBe(agentInstance.agentInstance.id);
    expect(detail?.session.state).toBe('creating');
    // Instances carry no read-only flag.
    expect(detail?.readOnly).toBeUndefined();
  });

  it('treats an empty response as an empty list, not drift', () => {
    // proto3 JSON omits an empty repeated field entirely.
    expect(normalizeSessionList({}, 'lab')).toEqual({ sessions: [] });
    expect(normalizeSessionList({ agentInstances: [] }, 'lab')).toEqual({
      sessions: [],
    });
  });

  it('skips an instance without an id and says so, keeping the rest', () => {
    const { sessions, drift } = normalizeSessionList(
      {
        agentInstances: [
          { name: 'no id' },
          null,
          agentInstances.agentInstances[0],
        ],
      },
      'lab',
    );

    expect(sessions).toHaveLength(1);
    expect(drift).toEqual({
      kind: 'skipped-rows',
      message: 'skipped 2 unreadable session rows',
    });
  });

  it('keeps unknown fields and unknown states out of the way', () => {
    const { sessions } = normalizeSessionList(
      {
        agentInstances: [
          {
            ...agentInstances.agentInstances[0],
            state: 'AGENT_INSTANCE_STATE_HIBERNATING',
            labels: { team: 'bumblebee' },
          },
        ],
      },
      'lab',
    );
    expect(sessions[0].state).toBe('hibernating');
  });

  it('spells instance states as one lower-case word', () => {
    expect(normalizeAgentInstanceState('AGENT_INSTANCE_STATE_READY')).toBe(
      'ready',
    );
    expect(normalizeAgentInstanceState('ready')).toBe('ready');
    expect(normalizeAgentInstanceState(undefined)).toBeUndefined();
  });

  it('encodes an agent reference the way kagent’s python identifier does', () => {
    expect(encodeKagentAgentId('kagent', 'k8s-agent')).toBe(
      'kagent__NS__k8s_agent',
    );
  });
});
