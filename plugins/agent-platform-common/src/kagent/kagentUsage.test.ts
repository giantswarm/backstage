import { normalizeTaskList } from './kagentSessionDetail';
import { A2aTaskWire } from './kagentTaskSchema';
import { mcpServerOf, reduceSessionUsage, utcDayKey } from './kagentUsage';
import {
  tasksAdkPrefixed,
  tasksAskUserPending,
  tasksMalformed,
  tasksV099,
} from '../testFixtures';

/** A window wide enough to admit every fixture. */
const WIDE = {
  startMs: Date.parse('2020-01-01T00:00:00Z'),
  endMs: Date.parse('2030-01-01T00:00:00Z'),
};

function tasksOf(envelope: unknown): A2aTaskWire[] {
  return normalizeTaskList(envelope).tasks;
}

/** One task, with the history entries given. */
function task(
  id: string,
  timestamp: string | undefined,
  history: unknown[],
): A2aTaskWire {
  return {
    id,
    contextId: 'c1',
    kind: 'task',
    status:
      timestamp === undefined
        ? { state: 'completed' }
        : { state: 'completed', timestamp },
    history,
  } as A2aTaskWire;
}

/** An agent message carrying a usage bag under the given prefix. */
function agentUsage(
  messageId: string,
  usage: Record<string, number>,
  prefix: 'kagent' | 'adk' = 'kagent',
) {
  return {
    kind: 'message',
    role: 'agent',
    messageId,
    metadata: { [`${prefix}_usage_metadata`]: usage },
    parts: [],
  };
}

/** A message with one function-call part. */
function callMessage(messageId: string, name: string, id?: string) {
  return {
    kind: 'message',
    role: 'agent',
    messageId,
    parts: [
      {
        kind: 'data',
        data: { name, id, args: {} },
        metadata: { kagent_type: 'function_call' },
      },
    ],
  };
}

describe('mcpServerOf', () => {
  it('reads the server segment of a proxied tool', () => {
    expect(mcpServerOf('x_prometheus_execute_query')).toBe('prometheus');
    expect(mcpServerOf('x_kubernetes_get')).toBe('kubernetes');
  });

  it('collapses a multi-segment prefix to its family', () => {
    // The accepted approximation: the exact server needs the installation's
    // MCPServer CRs, which nothing on this side can read, and the family is the
    // useful grouping anyway. Pinned so nobody "fixes" it silently.
    expect(mcpServerOf('x_kubernetes_gazelle_get_pods')).toBe('kubernetes');
  });

  it('returns null for a tool that is not proxied', () => {
    expect(mcpServerOf('github_search_issues')).toBeNull();
    expect(mcpServerOf(undefined)).toBeNull();
    expect(mcpServerOf('x_')).toBeNull();
  });
});

describe('utcDayKey', () => {
  it('buckets by UTC day, not by local day', () => {
    expect(utcDayKey(Date.parse('2026-07-23T23:59:59Z'))).toBe('2026-07-23');
    expect(utcDayKey(Date.parse('2026-07-24T00:00:01Z'))).toBe('2026-07-24');
  });
});

describe('reduceSessionUsage', () => {
  it('sums a real session exactly as the timeline does', () => {
    // The same fixture and the same expected sums as
    // `kagentTimeline.test.ts` ("sums message usage and delegated usage exactly
    // once each"): 1420 + 890 from the agent's own messages, 3100 from the
    // subagent's response. If these two ever disagree, the Usage page and the
    // session detail page are reporting different numbers for one session.
    const usage = reduceSessionUsage(tasksOf(tasksV099), WIDE);

    expect(usage.tally).toEqual({
      turns: 2,
      inputTokens: 1180 + 760 + 2600,
      outputTokens: 240 + 130 + 500,
      totalTokens: 1420 + 890 + 3100,
      // The two github calls. The `kagent__NS__sre_agent` delegation is not one.
      toolCalls: 2,
    });
  });

  it('counts the tools a session actually used, and their servers', () => {
    const usage = reduceSessionUsage(tasksOf(tasksV099), WIDE);

    expect(Object.fromEntries(usage.tools)).toEqual({
      github_search_issues: 1,
      github_list_labels: 1,
    });
    // Neither is muster-proxied, so both land under "not proxied".
    expect(Object.fromEntries(usage.servers)).toEqual({ null: 2 });
  });

  it('does not count a delegation as a tool call', () => {
    const usage = reduceSessionUsage(tasksOf(tasksV099), WIDE);

    expect([...usage.tools.keys()]).not.toContain('kagent__NS__sre_agent');
  });

  it('buckets a session by the UTC day of each turn', () => {
    const usage = reduceSessionUsage(tasksOf(tasksV099), WIDE);

    // Both turns fall on the same day in this fixture.
    expect([...usage.days.keys()]).toEqual(['2026-07-23']);
    expect(usage.days.get('2026-07-23')).toMatchObject({
      turns: 2,
      inputTokens: 1180 + 760 + 2600,
    });
    expect(usage.undatedTurns).toBe(0);
  });

  it('reads usage under the adk_ prefix too', () => {
    // Reading one prefix silently zeroes a session, and both occur on one
    // installation.
    const usage = reduceSessionUsage(tasksOf(tasksAdkPrefixed), WIDE);

    expect(usage.tally.inputTokens).toBeGreaterThan(0);
  });

  it('counts a repeated message once', () => {
    // kagent repeats the user's message verbatim every turn and can repeat an
    // agent message across an overlapping history window. Without the dedupe
    // this bag would be counted twice.
    const bag = { promptTokenCount: 100, candidatesTokenCount: 10 };
    const usage = reduceSessionUsage(
      [
        task('t1', '2026-07-23T10:00:00Z', [agentUsage('m1', bag)]),
        task('t2', '2026-07-23T11:00:00Z', [agentUsage('m1', bag)]),
      ],
      WIDE,
    );

    expect(usage.tally.inputTokens).toBe(100);
    expect(usage.tally.outputTokens).toBe(10);
  });

  it('ignores a usage bag on a user message', () => {
    // Some user messages carry one; kagent attributes the turn's tokens to the
    // agent's reply, so counting both double counts the turn.
    const usage = reduceSessionUsage(
      [
        task('t1', '2026-07-23T10:00:00Z', [
          {
            kind: 'message',
            role: 'user',
            messageId: 'u1',
            metadata: {
              kagent_usage_metadata: {
                promptTokenCount: 999,
                candidatesTokenCount: 999,
              },
            },
            parts: [],
          },
        ]),
      ],
      WIDE,
    );

    expect(usage.tally.inputTokens).toBe(0);
    expect(usage.tally.turns).toBe(1);
  });

  it('counts a delegated response whose call was in an earlier task', () => {
    // The reason `agentCallIds` is session-scoped rather than per task.
    const usage = reduceSessionUsage(
      [
        task('t1', '2026-07-23T10:00:00Z', [
          callMessage('m1', 'kagent__NS__sre_agent', 'call-1'),
        ]),
        task('t2', '2026-07-23T11:00:00Z', [
          {
            kind: 'message',
            role: 'agent',
            messageId: 'm2',
            parts: [
              {
                kind: 'data',
                // No `name` on the response: only the call id identifies it.
                data: {
                  id: 'call-1',
                  response: {
                    kagent_usage_metadata: {
                      promptTokenCount: 500,
                      candidatesTokenCount: 50,
                    },
                  },
                },
                metadata: { kagent_type: 'function_response' },
              },
            ],
          },
        ]),
      ],
      WIDE,
    );

    expect(usage.tally.inputTokens).toBe(500);
    expect(usage.tally.outputTokens).toBe(50);
    expect(usage.tally.toolCalls).toBe(0);
  });

  it('unwraps a proxied call and attributes it to its muster server', () => {
    const usage = reduceSessionUsage(
      [
        task('t1', '2026-07-23T10:00:00Z', [
          {
            kind: 'message',
            role: 'agent',
            messageId: 'm1',
            parts: [
              {
                kind: 'data',
                data: {
                  name: 'call_tool',
                  id: 'c1',
                  args: { name: 'x_kubernetes_get', arguments: {} },
                },
                metadata: { kagent_type: 'function_call' },
              },
            ],
          },
        ]),
      ],
      WIDE,
    );

    expect(Object.fromEntries(usage.tools)).toEqual({ x_kubernetes_get: 1 });
    expect(Object.fromEntries(usage.servers)).toEqual({ kubernetes: 1 });
  });

  it('counts neither the confirmation tool nor ask_user as a tool call', () => {
    // ADK plumbing, which kagent's own UI filters out too.
    const usage = reduceSessionUsage(
      [
        task('t1', '2026-07-23T10:00:00Z', [
          callMessage('m1', 'adk_request_confirmation', 'c1'),
          callMessage('m2', 'ask_user', 'c2'),
          callMessage('m3', 'adk_request_credential', 'c3'),
        ]),
      ],
      WIDE,
    );

    expect(usage.tally.toolCalls).toBe(0);
    expect(usage.tools.size).toBe(0);
  });

  it('excludes a task outside the window while keeping its in-window sibling', () => {
    // The reason the window is applied per task: a session last used yesterday
    // can hold turns from months ago.
    const bag = { promptTokenCount: 100, candidatesTokenCount: 10 };
    const usage = reduceSessionUsage(
      [
        task('old', '2026-05-01T10:00:00Z', [agentUsage('m-old', bag)]),
        task('new', '2026-07-23T10:00:00Z', [agentUsage('m-new', bag)]),
      ],
      {
        startMs: Date.parse('2026-07-01T00:00:00Z'),
        endMs: Date.parse('2026-08-01T00:00:00Z'),
      },
    );

    expect(usage.tally.turns).toBe(1);
    expect(usage.tally.inputTokens).toBe(100);
    expect([...usage.days.keys()]).toEqual(['2026-07-23']);
  });

  it('counts an undated turn in the totals but in no day', () => {
    // Dropping it would silently zero a kagent that stopped writing the field;
    // dating it would claim a date we do not have.
    const usage = reduceSessionUsage(
      [
        task('t1', undefined, [
          agentUsage('m1', {
            promptTokenCount: 100,
            candidatesTokenCount: 10,
          }),
        ]),
      ],
      WIDE,
    );

    expect(usage.tally.turns).toBe(1);
    expect(usage.tally.inputTokens).toBe(100);
    expect(usage.undatedTurns).toBe(1);
    expect(usage.days.size).toBe(0);
  });

  it('rejects Go zero time rather than bucketing it', () => {
    // Left raw it would create a `0001-01-01` bucket and stretch the chart's
    // domain by two millennia.
    const usage = reduceSessionUsage(
      [
        task('t1', '0001-01-01T00:00:00Z', [
          agentUsage('m1', {
            promptTokenCount: 100,
            candidatesTokenCount: 10,
          }),
        ]),
      ],
      WIDE,
    );

    expect(usage.days.size).toBe(0);
    expect(usage.undatedTurns).toBe(1);
  });

  it('counts an unparseable history entry without losing the session', () => {
    const usage = reduceSessionUsage(
      [task('t1', '2026-07-23T10:00:00Z', [42, 'nope', null])],
      WIDE,
    );

    expect(usage.unparseableMessages).toBeGreaterThan(0);
    expect(usage.tally.turns).toBe(1);
  });

  it('never throws on a malformed payload', () => {
    expect(() =>
      reduceSessionUsage(tasksOf(tasksMalformed), WIDE),
    ).not.toThrow();
  });

  it('counts no tokens for a session waiting on an unanswered question', () => {
    // `status.message` carries the pending prompt and has no message-level
    // metadata, so it contributes no usage — matching the timeline.
    const usage = reduceSessionUsage(tasksOf(tasksAskUserPending), WIDE);

    expect(usage.tally.inputTokens).toBe(0);
    expect(usage.tally.outputTokens).toBe(0);
  });

  it('returns an empty summary for no tasks', () => {
    const usage = reduceSessionUsage([], WIDE);

    expect(usage.tally).toEqual({
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
    });
    expect(usage.days.size).toBe(0);
  });
});
