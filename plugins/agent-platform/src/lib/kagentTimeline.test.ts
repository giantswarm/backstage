import { buildTimeline, TimelineItem } from './kagentTimeline';
import { normalizeTaskList } from './kagentSessionDetail';
import { A2aTaskWire } from './kagentTaskSchema';

import kagentPrefixed from './__fixtures__/tasks.v0-9-9.json';
import adkPrefixed from './__fixtures__/tasks.adk-prefixed.json';
import approval from './__fixtures__/tasks.approval.json';
import malformed from './__fixtures__/tasks.malformed.json';
import emptyNoData from './__fixtures__/tasks.empty-no-data.json';
import bareArray from './__fixtures__/tasks.bare-array.json';

/** Parse a fixture the way the client does, then build its timeline. */
function timelineFor(
  fixture: unknown,
  timestamps?: Map<string, string>,
): ReturnType<typeof buildTimeline> {
  const { tasks } = normalizeTaskList(fixture);
  return buildTimeline(tasks, timestamps);
}

function kinds(items: TimelineItem[]): string[] {
  return items.map(item => item.kind);
}

describe('buildTimeline', () => {
  it('reads a realistic session into an ordered timeline', () => {
    const { items } = timelineFor(kagentPrefixed);

    expect(kinds(items)).toEqual([
      'user-message',
      'reasoning',
      'tool-call',
      'agent-message',
      'user-message',
      'agent-call',
    ]);
  });

  it('merges consecutive text parts of the same kind into one item', () => {
    // The reasoning arrives as two adjacent text parts; splitting them would
    // render one thought as two.
    const { items } = timelineFor(kagentPrefixed);
    const reasoning = items.find(item => item.kind === 'reasoning');

    expect(reasoning).toMatchObject({
      kind: 'reasoning',
      text: "I need the repository's open issues filtered by assignee. The search API is cheaper than listing every issue.",
    });
  });

  it('folds a tool result into the call it answers', () => {
    const { items } = timelineFor(kagentPrefixed);
    const toolCall = items.find(item => item.kind === 'tool-call');

    expect(toolCall).toMatchObject({
      kind: 'tool-call',
      toolName: 'github_search_issues',
      args: { query: 'repo:giantswarm/backstage is:open assignee:@me' },
      isPending: false,
    });
    expect((toolCall as { result?: unknown }).result).toMatchObject({
      total_count: 2,
    });
  });

  it('classifies a delegation as an agent call, not a tool call', () => {
    const { items } = timelineFor(kagentPrefixed);
    const agentCall = items.find(item => item.kind === 'agent-call');

    expect(agentCall).toMatchObject({
      kind: 'agent-call',
      agentId: 'kagent__NS__sre_agent',
      isPending: false,
      // The delegated agent's own usage rides in the response, because its
      // messages live in its own session and never appear here.
      tokens: { total: 3100, prompt: 2600, completion: 500 },
    });
  });

  it('attributes messages to their author', () => {
    const { items } = timelineFor(kagentPrefixed);
    const reply = items.find(item => item.kind === 'agent-message');

    expect(reply?.author).toBe('issue-tracker');
  });

  it('sums message usage and delegated usage exactly once each', () => {
    // 1420 + 890 from the agent's own messages, 3100 from the subagent.
    const { tokens } = timelineFor(kagentPrefixed);

    expect(tokens).toEqual({
      total: 1420 + 890 + 3100,
      prompt: 1180 + 760 + 2600,
      completion: 240 + 130 + 500,
    });
  });

  it('groups items by the task they came from', () => {
    const { items } = timelineFor(kagentPrefixed);

    expect(items.map(item => item.taskIndex)).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it('gives every item a unique id', () => {
    const { items } = timelineFor(kagentPrefixed);
    const ids = items.map(item => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('metadata prefixes', () => {
    it('reads adk_ and kagent_ prefixes identically', () => {
      // kagent's own UI resolves adk_ then kagent_, so a session can mix both
      // depending on which version wrote each message. The two fixtures carry
      // identical content under different prefixes and must normalize the same.
      const withKagent = timelineFor(kagentPrefixed);
      const withAdk = timelineFor(adkPrefixed);

      expect(withAdk.tokens).toEqual(withKagent.tokens);
      expect(kinds(withAdk.items)).toEqual(kinds(withKagent.items));
      expect(withAdk.items.map(item => item.author)).toEqual(
        withKagent.items.map(item => item.author),
      );
    });
  });

  describe('timestamps', () => {
    it('prefers the per-message time recovered from events', () => {
      const { items } = timelineFor(
        kagentPrefixed,
        new Map([['m-user-1', '2026-07-23T16:04:29.101Z']]),
      );

      expect(items[0].at).toBe('2026-07-23T16:04:29.101Z');
    });

    it('falls back to the task timestamp when a message has none', () => {
      // The join is decoration: A2A messages carry no time, and the two storage
      // paths are not guaranteed to agree on ids.
      const { items } = timelineFor(kagentPrefixed, new Map());

      expect(items[0].at).toBe('2026-07-23T16:05:11.204Z');
      expect(items[items.length - 1].at).toBe('2026-07-23T16:09:58.162Z');
    });

    it('renders no time at all when neither source has one', () => {
      const tasks: A2aTaskWire[] = [
        {
          history: [
            {
              kind: 'message',
              messageId: 'm1',
              role: 'user',
              parts: [{ kind: 'text', text: 'hi' }],
            },
          ],
        } as unknown as A2aTaskWire,
      ];

      const { items } = buildTimeline(tasks);

      expect(items).toHaveLength(1);
      expect(items[0].at).toBeUndefined();
    });
  });

  describe('approvals', () => {
    it('shows the proposed tool and the verdict, not the decision message', () => {
      const { items } = timelineFor(approval);

      expect(kinds(items)).toEqual([
        'user-message',
        'approval',
        'agent-message',
      ]);
      expect(items[1]).toMatchObject({
        kind: 'approval',
        toolName: 'flux_reconcile',
        args: expect.objectContaining({ name: 'cluster-app' }),
        verdict: 'approved',
      });
    });

    it('reads a rejection', () => {
      const rejected = withDecision(approval, { decision_type: 'reject' });

      expect(timelineFor(rejected).items[1]).toMatchObject({
        verdict: 'rejected',
      });
    });

    it('reads a batch decision, with any rejection rejecting', () => {
      const rejected = withDecision(approval, {
        decision_type: 'batch',
        decisions: { 'call-flux-1': 'approve', 'call-other': 'reject' },
      });

      expect(timelineFor(rejected).items[1]).toMatchObject({
        verdict: 'rejected',
      });
    });

    it('leaves the verdict unset for wording it does not recognise', () => {
      // Defaulting to "approved" would claim the user consented to an action they
      // may have refused.
      const odd = withDecision(approval, { decision_type: 'deferred' });
      const { items } = timelineFor(odd);

      expect(items[1]).toMatchObject({ kind: 'approval' });
      expect((items[1] as { verdict?: string }).verdict).toBeUndefined();
      // The decision message is still swallowed rather than rendered as prose.
      expect(kinds(items)).toEqual([
        'user-message',
        'approval',
        'agent-message',
      ]);
    });

    it('leaves an unanswered approval pending', () => {
      const pending = structuredClone(approval) as typeof approval;
      pending.data[0].history = pending.data[0].history.filter(
        item => item.messageId !== 'm-decision-1',
      );
      const { items } = timelineFor(pending);

      expect((items[1] as { verdict?: string }).verdict).toBeUndefined();
    });
  });

  describe('robustness', () => {
    it('survives a fixture full of malformed rows', () => {
      const { items, skippedMessages } = timelineFor(malformed);

      // The readable message, the orphan response, and the unnamed call survive.
      expect(kinds(items)).toEqual([
        'user-message',
        'tool-call',
        'tool-call',
        'agent-message',
      ]);
      expect(items[0]).toMatchObject({ text: 'still readable' });
      expect(skippedMessages).toBeGreaterThan(0);
    });

    it('renders an orphan tool response rather than dropping it', () => {
      // Its call was in a task we do not have, or carried no id. A result with no
      // visible request is odd, but hiding it would be worse.
      const { items } = timelineFor(malformed);

      expect(items[1]).toMatchObject({
        kind: 'tool-call',
        toolName: 'kubectl_get',
        isPending: false,
      });
    });

    it('labels a call that carries no tool name', () => {
      const { items } = timelineFor(malformed);

      expect(items[2]).toMatchObject({
        kind: 'tool-call',
        toolName: 'unknown tool',
        isPending: true,
      });
    });

    it('ignores usage metadata that is not an object', () => {
      const { tokens } = timelineFor(malformed);

      expect(tokens).toEqual({ total: 0, prompt: 0, completion: 0 });
    });

    it('returns an empty timeline for a session with no tasks', () => {
      expect(timelineFor(emptyNoData)).toEqual({
        items: [],
        tokens: { total: 0, prompt: 0, completion: 0 },
        skippedMessages: 0,
      });
    });

    it('reads a bare top-level array', () => {
      expect(kinds(timelineFor(bareArray).items)).toEqual(['user-message']);
    });

    it.each([undefined, null, 0, 'nope', {}, [], [null]])(
      'never throws on %p',
      input => {
        expect(() => timelineFor(input)).not.toThrow();
      },
    );

    it('deduplicates a message repeated across tasks', () => {
      // kagent can resend a message in an overlapping history window; rendering it
      // twice would read as the agent saying the same thing twice.
      const tasks = normalizeTaskList(kagentPrefixed).tasks;
      const duplicated = [...tasks, structuredClone(tasks[0])];

      expect(buildTimeline(duplicated).items).toHaveLength(
        buildTimeline(tasks).items.length,
      );
    });

    it('does not match a response to a call from a different task', () => {
      // Open calls are scoped per task: letting them match across turns would
      // attach a result to the wrong call when a tool is used repeatedly.
      const tasks = normalizeTaskList(kagentPrefixed).tasks;
      const [firstTask] = tasks;
      // Keep only the call, and put a same-id response in a later task.
      const callOnly = structuredClone(firstTask);
      callOnly.history = (callOnly.history as unknown[]).filter(
        item => (item as { messageId?: string }).messageId === 'm-agent-call-1',
      );
      const responseOnly = structuredClone(firstTask);
      responseOnly.history = (responseOnly.history as unknown[]).filter(
        item =>
          (item as { messageId?: string }).messageId === 'm-agent-response-1',
      );

      const { items } = buildTimeline([callOnly, responseOnly]);

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({ kind: 'tool-call', isPending: true });
      expect(items[1]).toMatchObject({ kind: 'tool-call', isPending: false });
    });
  });
});

/** Replace the decision payload in the approval fixture. */
function withDecision(fixture: typeof approval, decision: object) {
  const copy = structuredClone(fixture);
  const message = copy.data[0].history.find(
    item => item.messageId === 'm-decision-1',
  );
  (message as { parts: unknown[] }).parts = [{ kind: 'data', data: decision }];
  return copy;
}
