import { buildTimeline, TimelineItem } from './kagentTimeline';
import { normalizeTaskList } from './kagentSessionDetail';
import { A2aTaskWire } from './kagentTaskSchema';

import kagentPrefixed from './__fixtures__/tasks.v0-9-9.json';
import adkPrefixed from './__fixtures__/tasks.adk-prefixed.json';
import approval from './__fixtures__/tasks.approval.json';
import askUserPending from './__fixtures__/tasks.ask-user-pending.json';
import malformed from './__fixtures__/tasks.malformed.json';
import emptyNoData from './__fixtures__/tasks.empty-no-data.json';
import bareArray from './__fixtures__/tasks.bare-array.json';
import failed from './__fixtures__/tasks.failed.json';

/** Parse a fixture the way the client does, then build its timeline. */
function timelineFor(fixture: unknown): ReturnType<typeof buildTimeline> {
  const { tasks } = normalizeTaskList(fixture);
  return buildTimeline(tasks);
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
      // One message carrying prose then two calls, split in part order.
      'agent-message',
      'tool-call',
      'tool-call',
      'agent-message',
      'user-message',
      'agent-call',
    ]);
  });

  it('shows a user message once even though kagent stores it twice', () => {
    // Live kagent history repeats the user message verbatim under the same
    // messageId on every turn. Without the dedupe the timeline opens each turn by
    // saying the same thing twice.
    const { items } = timelineFor(kagentPrefixed);

    expect(items.filter(item => item.kind === 'user-message')).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: 'user-message',
      taskIndex: 0,
    });
    expect(items[1].kind).not.toBe('user-message');
  });

  it('keeps prose before the calls it introduces', () => {
    // Real messages are text-first, then their data parts. Emitting the calls
    // first would invert the agent's narration.
    const { items } = timelineFor(kagentPrefixed);
    const firstAgentText = items.findIndex(
      item => item.kind === 'agent-message',
    );
    const firstCall = items.findIndex(item => item.kind === 'tool-call');

    expect(firstAgentText).toBeLessThan(firstCall);
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
    // Live payloads carry the author as a python identifier (`issue_tracker`),
    // not a display name — the UI is responsible for resolving it against the
    // Agent CRs. Asserted on the last item of the first turn, which is the
    // agent's actual reply.
    const { items } = timelineFor(kagentPrefixed);

    expect(items[1].author).toBe('issue-tracker');
    expect(items[3].author).toBe('issue_tracker');
    expect(
      items.find(item => item.kind === 'user-message')?.author,
    ).toBeUndefined();
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

    expect(items.map(item => item.taskIndex)).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
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
    it('gives every item its task’s timestamp', () => {
      // A2A messages carry no time of their own and there is no finer source:
      // the session's stored events turned out to be ADK events with no
      // messageId to join on. So items within a turn share a time by design, and
      // the UI should show it per turn rather than imply per-message precision.
      const { items } = timelineFor(kagentPrefixed);

      expect(items[0].at).toBe('2026-07-23T16:05:11.204Z');
      expect(items[items.length - 1].at).toBe('2026-07-23T16:09:58.162Z');
      // Both items of the first turn carry the same time.
      expect(items[1].at).toBe(items[0].at);
    });

    it('rejects Go zero time rather than rendering "Dec 31, 0000"', () => {
      // Task timestamps are non-pointer Go `time.Time`, so an unset one arrives as
      // 0001-01-01T00:00:00Z. This is now the only timestamp source, so it becomes
      // `at` for every item in the task.
      const tasks = normalizeTaskList(kagentPrefixed).tasks;
      const zeroTime = {
        ...tasks[0],
        status: { state: 'completed', timestamp: '0001-01-01T00:00:00Z' },
      } as A2aTaskWire;

      const { items } = buildTimeline([zeroTime]);

      expect(items.length).toBeGreaterThan(0);
      expect(items.every(item => item.at === undefined)).toBe(true);
    });

    it('renders no time at all when the task has none', () => {
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

  describe('a question the session is still waiting on', () => {
    it('renders the pending question from status.message', () => {
      // The unanswered confirmation is on `status.message` and nowhere in
      // history, while the raw `ask_user` call in history is skipped as ADK
      // plumbing. Before this was read, a session that ended by asking the user
      // something rendered as if the agent had simply stopped talking.
      const { items } = timelineFor(askUserPending);

      expect(kinds(items)).toEqual([
        'user-message',
        'agent-message',
        'user-message',
        'approval',
      ]);
      expect(items[3]).toMatchObject({
        kind: 'approval',
        asks: 'input',
        toolName: 'ask_user',
        args: expect.objectContaining({
          questions: [
            {
              question:
                'What would you like to investigate next on the management cluster?',
            },
          ],
        }),
      });
      // Nobody has answered, so it must not claim a verdict either way.
      expect(items[3]).not.toHaveProperty('verdict', 'approved');
      expect(items[3]).not.toHaveProperty('verdict', 'rejected');
    });

    it('takes the pending question at its task timestamp', () => {
      const { items } = timelineFor(askUserPending);

      expect(items[3].at).toBe('2026-08-06T06:49:30.635Z');
    });

    it('counts no tokens for it', () => {
      // `status.message` carries no message-level metadata on a real payload, so
      // it must not be able to inflate the session total.
      const { tokens } = timelineFor(askUserPending);

      expect(tokens).toEqual({ total: 0, prompt: 0, completion: 0 });
    });

    it('does not report it as an unreadable message', () => {
      const { skippedMessages } = timelineFor(askUserPending);

      expect(skippedMessages).toBe(0);
    });

    it('drops the prompt once the task is no longer waiting', () => {
      // Self-clearing: when the user answers elsewhere, the task reaches a
      // terminal state and the answered confirmation renders from history
      // instead. Emitting it on state alone would leave a question card standing
      // after it had been answered.
      const answered = structuredClone(askUserPending) as typeof askUserPending;
      answered.data[1].status.state = 'completed';

      const { items } = timelineFor(answered);

      expect(kinds(items)).toEqual([
        'user-message',
        'agent-message',
        'user-message',
      ]);
    });

    it('renders one approval, not two, once the question is answered', () => {
      // The post-answer shape, from kagent's resume path: a HITL decision resumes
      // the *stored* task (`executor.go` — `StoredTask != nil` emits `working` on
      // it and appends the decision to its history), so the asking task leaves
      // `input-required` and its confirmation is now in history with a verdict.
      // The concern this pins down is the overlap: if the prompt were still
      // emitted from `status` while the answered copy renders from history, the
      // same question would appear twice, one of them "Awaiting a reply" forever.
      // Typed loosely on purpose: the entries appended below are shapes the JSON
      // fixture's inferred element type does not have, and they are exactly what
      // kagent writes on resume.
      const answered = structuredClone(askUserPending) as unknown as {
        data: { status: { state: string }; history: unknown[] }[];
      };
      const task = answered.data[1];
      task.status.state = 'completed';
      task.history.push(
        {
          kind: 'message',
          messageId: 'm-confirm-1',
          role: 'agent',
          metadata: { adk_author: 'sre_agent' },
          parts: [
            {
              kind: 'data',
              metadata: {
                adk_type: 'function_call',
                adk_is_long_running: true,
              },
              data: {
                id: 'adk-pending-1',
                name: 'adk_request_confirmation',
                args: {
                  originalFunctionCall: {
                    id: 'call-ask-pending-1',
                    name: 'ask_user',
                    args: {
                      questions: [
                        {
                          question:
                            'What would you like to investigate next on the management cluster?',
                        },
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
        {
          kind: 'message',
          messageId: 'm-answer-1',
          role: 'user',
          parts: [
            { kind: 'data', data: { decision_type: 'approve' } },
            { kind: 'text', text: 'The muster auth config, please.' },
          ],
        },
      );

      const { items } = timelineFor(answered);

      expect(items.filter(item => item.kind === 'approval')).toHaveLength(1);
      expect(kinds(items)).toEqual([
        'user-message',
        'agent-message',
        'user-message',
        'approval',
        'user-message',
      ]);
      expect(items[3]).toMatchObject({ kind: 'approval', verdict: 'approved' });
    });

    it('ignores a status message on a task that is not waiting', () => {
      const terminal = structuredClone(askUserPending) as typeof askUserPending;
      terminal.data[1].status.state = 'failed';

      expect(kinds(timelineFor(terminal).items)).not.toContain('approval');
    });

    it('does not report an unreadable status message as data loss', () => {
      // `status.message` is `z.unknown()` at the parse boundary, so a kagent
      // version putting a bare string there (an auth-required hint, say) must not
      // reach the message parser — it would count as `skippedMessages` and the UI
      // would tell the user "1 message could not be read" about a healthy session.
      const hint = structuredClone(askUserPending) as typeof askUserPending;
      (hint.data[1].status as { message?: unknown }).message =
        'Sign in to continue';

      const { items, skippedMessages } = timelineFor(hint);

      expect(skippedMessages).toBe(0);
      expect(kinds(items)).not.toContain('approval');
    });

    it('reads a prompt on auth-required too', () => {
      const auth = structuredClone(askUserPending) as typeof askUserPending;
      auth.data[1].status.state = 'auth-required';

      expect(kinds(timelineFor(auth).items)).toContain('approval');
    });
  });

  describe('a turn that failed', () => {
    it('renders the reason from status.message as a failed turn', () => {
      // The Go runtime writes the provider's error to the failed task's
      // status.message and nothing to history, so without this the page showed
      // the user's message with no reply under it — and a "Failed" badge as the
      // only hint that anything had happened.
      const { items } = timelineFor(failed);

      expect(kinds(items)).toEqual([
        'user-message',
        'turn-failed',
        'user-message',
        'turn-failed',
      ]);
      expect(items[1]).toMatchObject({
        kind: 'turn-failed',
        state: 'failed',
        taskIndex: 0,
        messageId: 'm-failure-1',
        reason: expect.stringContaining(
          'The model `gpt-6-astra` does not exist or you do not have access to it.',
        ),
      });
    });

    it('takes the failure at its task timestamp', () => {
      const { items } = timelineFor(failed);

      expect(items[1].at).toBe('2026-09-04T09:04:28.933Z');
    });

    it('counts no tokens for it and reports no unreadable message', () => {
      const { tokens, skippedMessages } = timelineFor(failed);

      expect(tokens.total).toBe(0);
      expect(skippedMessages).toBe(0);
    });

    it('still marks the turn when kagent gave no reason', () => {
      const silent = structuredClone(failed) as typeof failed;
      delete (silent.data[0].status as { message?: unknown }).message;
      const { items } = timelineFor(silent);

      expect(items[1]).toMatchObject({ kind: 'turn-failed', state: 'failed' });
      expect((items[1] as { reason?: string }).reason).toBeUndefined();
    });

    it('does not repeat a reason history already carries', () => {
      // A runtime that also records the failing reply in history has already
      // rendered it as prose; the entry then says only that the turn failed.
      const echoed = structuredClone(failed) as typeof failed;
      (echoed.data[0].history as unknown[]).push(echoed.data[0].status.message);
      const { items } = timelineFor(echoed);

      expect(kinds(items).slice(0, 3)).toEqual([
        'user-message',
        'agent-message',
        'turn-failed',
      ]);
      expect((items[2] as { reason?: string }).reason).toBeUndefined();
    });

    it('reads a rejected turn the same way', () => {
      const rejected = structuredClone(failed) as typeof failed;
      rejected.data[0].status.state = 'rejected';
      const { items } = timelineFor(rejected);

      expect(items[1]).toMatchObject({
        kind: 'turn-failed',
        state: 'rejected',
      });
    });

    it('leaves a completed turn’s status message alone', () => {
      // The mirror image, restated beside it: on a completed task status.message
      // is the reply, which history already holds.
      const done = structuredClone(failed) as typeof failed;
      done.data[0].status.state = 'completed';
      const { items } = timelineFor(done);

      expect(kinds(items)).toEqual([
        'user-message',
        'user-message',
        'turn-failed',
      ]);
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

    it('drops the confirmation’s own function_response', () => {
      // ADK resumes a long-running tool by sending its function_response. The
      // approval is never registered as an open call, so that response always
      // reaches the orphan branch — and unfiltered it renders as a tool call
      // literally named `adk_request_confirmation`, exposing ADK's internal
      // payload right after the approval card. kagent's UI filters the same name.
      const { items } = timelineFor(approval);

      expect(kinds(items)).toEqual([
        'user-message',
        'approval',
        'agent-message',
      ]);
      expect(
        items.some(
          item =>
            item.kind === 'tool-call' && /confirmation/.test(item.toolName),
        ),
      ).toBe(false);
    });

    it('recognises an approval by name even without the long-running flag', () => {
      // Discriminating on the flag would degrade an approval into a raw tool call
      // exposing the `originalFunctionCall` wrapper — and it fails open in the
      // ugliest direction, since a flag arriving as the string "true" is rejected
      // by design.
      const unflagged = structuredClone(approval) as typeof approval;
      const confirm = unflagged.data[0].history.find(
        item => item.messageId === 'm-confirm-1',
      );
      delete (confirm as { parts: { metadata: Record<string, unknown> }[] })
        .parts[0].metadata.kagent_is_long_running;

      const { items } = timelineFor(unflagged);

      expect(items[1]).toMatchObject({
        kind: 'approval',
        toolName: 'flux_reconcile',
      });
    });

    it('attaches a verdict recorded in a later task', () => {
      // kagent can record the decision in a new task. With the open approval
      // tracked per task, the decision was dropped *and* the approval left looking
      // unanswered — the user approved and the UI said they never replied.
      const split = structuredClone(approval) as typeof approval;
      const history = split.data[0].history;
      const decisionIndex = history.findIndex(
        item => item.messageId === 'm-decision-1',
      );
      const [decision] = history.splice(decisionIndex, 1);
      split.data.push({
        id: 'task-2',
        kind: 'task',
        status: { state: 'completed', timestamp: '2026-07-24T09:20:00.000Z' },
        history: [decision],
      } as (typeof split.data)[number]);

      const { items } = timelineFor(split);

      expect(items[1]).toMatchObject({ kind: 'approval', verdict: 'approved' });
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

  describe('calls proxied through Muster', () => {
    /** A `call_tool` invocation wrapping the tool actually wanted. */
    function proxiedTasks(args: unknown): A2aTaskWire[] {
      return [
        {
          status: { state: 'completed', timestamp: '2026-07-24T09:00:00.000Z' },
          history: [
            {
              kind: 'message',
              messageId: 'm1',
              role: 'agent',
              parts: [
                {
                  kind: 'data',
                  metadata: { kagent_type: 'function_call' },
                  data: { id: 'c1', name: 'call_tool', args },
                },
              ],
            },
          ],
        },
      ] as unknown as A2aTaskWire[];
    }

    it('names the tool actually invoked, not the proxy', () => {
      // Agents reach most MCP tools through muster's `call_tool`, so without this
      // every row reads `call_tool` and the real tool is buried in the arguments —
      // the problem reported in giantswarm/klaus-gateway#163.
      const { items } = buildTimeline(
        proxiedTasks({
          name: 'x_kubernetes_get',
          arguments: {
            apiGroup: 'helm.toolkit.fluxcd.io',
            resourceType: 'helmreleases',
          },
        }),
      );

      expect(items[0]).toMatchObject({
        kind: 'tool-call',
        toolName: 'x_kubernetes_get',
        via: 'Muster',
        // Unwrapped: the inner arguments, not the `{name, arguments}` envelope.
        args: {
          apiGroup: 'helm.toolkit.fluxcd.io',
          resourceType: 'helmreleases',
        },
      });
    });

    it('leaves a call_tool whose payload lacks the wrapper shape alone', () => {
      // Degrades to showing the proxy rather than losing the call, if `call_tool`
      // ever changes shape.
      const { items } = buildTimeline(proxiedTasks({ unexpected: true }));

      expect(items[0]).toMatchObject({
        kind: 'tool-call',
        toolName: 'call_tool',
        args: { unexpected: true },
      });
      expect((items[0] as { via?: string }).via).toBeUndefined();
    });

    it('unwraps a proxied call that genuinely has no arguments', () => {
      // `{ name }` alone is an argument-less tool reached through the proxy. There
      // is nothing to lose by unwrapping, so it still names the real tool.
      const { items } = buildTimeline(proxiedTasks({ name: 'x_core_list' }));

      expect(items[0]).toMatchObject({
        kind: 'tool-call',
        toolName: 'x_core_list',
        via: 'Muster',
      });
    });

    it('keeps the wrapper when the payload carries a key we do not know', () => {
      // The promise the docstring makes: degrade to showing the proxy, never to a
      // call whose arguments were silently dropped. Keying only on `name` would
      // name the real tool here and lose `parameters` entirely, leaving a row with
      // nothing to expand.
      const { items } = buildTimeline(
        proxiedTasks({
          name: 'x_kubernetes_get',
          parameters: { ns: 'default' },
        }),
      );

      expect(items[0]).toMatchObject({
        kind: 'tool-call',
        toolName: 'call_tool',
        args: { name: 'x_kubernetes_get', parameters: { ns: 'default' } },
      });
      expect((items[0] as { via?: string }).via).toBeUndefined();
    });

    it('marks nothing as proxied when the tool was called directly', () => {
      const { items } = timelineFor(kagentPrefixed);
      const direct = items.find(
        item =>
          item.kind === 'tool-call' && item.toolName === 'github_search_issues',
      );

      expect((direct as { via?: string }).via).toBeUndefined();
    });

    it('still resolves a proxied call’s result, which is keyed on the outer id', () => {
      // The response carries the *wrapper's* call id and name, so unwrapping the
      // request must not break the pairing.
      const tasks = proxiedTasks({ name: 'x_kubernetes_get', arguments: {} });
      (tasks[0].history as unknown[]).push({
        kind: 'message',
        messageId: 'm2',
        role: 'agent',
        parts: [
          {
            kind: 'data',
            metadata: { kagent_type: 'function_response' },
            data: { id: 'c1', name: 'call_tool', response: { ok: true } },
          },
        ],
      });

      const { items } = buildTimeline(tasks);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        toolName: 'x_kubernetes_get',
        isPending: false,
        result: { ok: true },
      });
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

    it('does not count non-message history entries as data loss', () => {
      // `skippedMessages` feeds a "N messages could not be read" warning. An
      // artifact or status update in `history` is a healthy part of a session we
      // simply don't render, so counting it would make the UI warn about sound
      // sessions. The malformed fixture's history holds `null`, a bare string and
      // an `artifact-update` — only the first two are data loss.
      const { skippedMessages } = timelineFor(malformed);

      expect(skippedMessages).toBe(2);
    });

    it('resolves a repeated call whose response lands in a later task', () => {
      // Dedupe is session-wide but open calls are per task, so a call message
      // repeated across tasks used to render twice: once stuck pending in the first
      // task, once as an orphan result in the second.
      const tasks = normalizeTaskList(kagentPrefixed).tasks;
      const callMessage = (tasks[0].history as unknown[]).find(
        item => (item as { messageId?: string }).messageId === 'm-agent-call-1',
      );
      const responseMessage = (tasks[0].history as unknown[]).find(
        item =>
          (item as { messageId?: string }).messageId === 'm-agent-response-1',
      );

      const { items } = buildTimeline([
        { ...tasks[0], history: [callMessage] } as A2aTaskWire,
        // The same call message again, plus its response.
        {
          ...tasks[0],
          history: [callMessage, responseMessage],
        } as A2aTaskWire,
      ]);

      const search = items.filter(
        item =>
          item.kind === 'tool-call' && item.toolName === 'github_search_issues',
      );
      expect(search).toHaveLength(1);
      expect(search[0]).toMatchObject({ isPending: false });
    });

    it('ignores usage metadata that is not an object', () => {
      const { tokens } = timelineFor(malformed);

      expect(tokens).toEqual({ total: 0, prompt: 0, completion: 0 });
    });

    it('derives a total when kagent reports only the breakdown', () => {
      // Found live on gazelle: every message carries promptTokenCount and
      // candidatesTokenCount but no totalTokenCount, so summing reported totals
      // rendered "Total 0" beside 1.4M input. kagent's own UI has the same hole
      // (`total: usage.totalTokenCount ?? 0`).
      const tasks = [
        {
          status: { state: 'completed', timestamp: '2026-07-24T09:00:00.000Z' },
          history: [
            {
              kind: 'message',
              messageId: 'm1',
              role: 'agent',
              metadata: {
                kagent_usage_metadata: {
                  promptTokenCount: 1000,
                  candidatesTokenCount: 250,
                },
              },
              parts: [{ kind: 'text', text: 'hi' }],
            },
          ],
        },
      ] as unknown as A2aTaskWire[];

      expect(buildTimeline(tasks).tokens).toEqual({
        total: 1250,
        prompt: 1000,
        completion: 250,
      });
    });

    it('prefers a reported total over the sum of its parts', () => {
      // A model billing thinking tokens separately counts them in the total but in
      // neither part, so the reported total is not always prompt + completion and
      // must not be recomputed away.
      const tasks = [
        {
          status: { state: 'completed', timestamp: '2026-07-24T09:00:00.000Z' },
          history: [
            {
              kind: 'message',
              messageId: 'm1',
              role: 'agent',
              metadata: {
                kagent_usage_metadata: {
                  totalTokenCount: 2000,
                  promptTokenCount: 1000,
                  candidatesTokenCount: 250,
                },
              },
              parts: [{ kind: 'text', text: 'hi' }],
            },
          ],
        },
      ] as unknown as A2aTaskWire[];

      expect(buildTimeline(tasks).tokens.total).toBe(2000);
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

      // The call in task 0 must stay pending — the later response did not close
      // it — and the response must surface as its own orphan item in task 1,
      // recognisable by having a result but no arguments.
      const search = items.filter(
        item =>
          item.kind === 'tool-call' && item.toolName === 'github_search_issues',
      );
      expect(search).toHaveLength(2);
      expect(search[0]).toMatchObject({
        taskIndex: 0,
        isPending: true,
        args: { query: 'repo:giantswarm/backstage is:open assignee:@me' },
      });
      expect(search[1]).toMatchObject({
        taskIndex: 1,
        isPending: false,
        args: undefined,
      });
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
