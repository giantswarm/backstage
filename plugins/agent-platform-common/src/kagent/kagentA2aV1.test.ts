import stream from './__fixtures__/stream.kagent-4a91c273.json';
import canceled from './__fixtures__/task.canceled.kagent-4a91c273.json';
import hitlApproval from './__fixtures__/tasks.hitl-approval.kagent-4a91c273.json';
import tasks from './__fixtures__/tasks.kagent-4a91c273.json';
import v0Tasks from './__fixtures__/tasks.v0-9-9.json';
import {
  HITL_EXTENSION_URI,
  isA2aV1StreamResponse,
  isA2aV1TaskList,
  normalizeA2aRole,
  normalizeA2aState,
  normalizeStreamEvent,
  toWireMessage,
  toWirePart,
  toWireStreamEvent,
  toWireTask,
} from './kagentA2aV1';
import {
  CONFIRMATION_TOOL_NAME,
  isFunctionCallPart,
  isFunctionResponsePart,
  parsePart,
  readFunctionCall,
  readTokenUsage,
} from './kagentParts';
import { normalizeTaskList } from './kagentSessionDetail';
import {
  AWAITING_INPUT_STATES,
  describeSessionState,
  readNewestTaskState,
} from './kagentSessionState';
import { reduceSessionUsage } from './kagentUsage';

type Wire = Record<string, unknown>;

describe('A2A v1 spellings', () => {
  it('takes enum names down to the readers’ spelling', () => {
    expect(normalizeA2aState('TASK_STATE_INPUT_REQUIRED')).toBe(
      'input-required',
    );
    expect(normalizeA2aState('TASK_STATE_COMPLETED')).toBe('completed');
    expect(normalizeA2aState('completed')).toBe('completed');
    expect(normalizeA2aState('Input-Required')).toBe('input-required');
    // A legacy or unknown spelling is only lower-cased, never re-punctuated.
    expect(normalizeA2aState('__proto__')).toBe('__proto__');
    expect(normalizeA2aState(undefined)).toBeUndefined();
    expect(normalizeA2aRole('ROLE_USER')).toBe('user');
    expect(normalizeA2aRole('ROLE_AGENT')).toBe('agent');
    expect(normalizeA2aRole('agent')).toBe('agent');
  });

  it('is what describeSessionState resolves a v1 state through', () => {
    expect(describeSessionState('TASK_STATE_WORKING')).toEqual(
      expect.objectContaining({ key: 'working', isActive: true }),
    );
    expect(
      AWAITING_INPUT_STATES.has(
        describeSessionState('TASK_STATE_INPUT_REQUIRED')!.key,
      ),
    ).toBe(true);
  });
});

describe('parts and messages', () => {
  it('translates the oneof into kind-discriminated parts, keeping the metadata bag', () => {
    expect(
      toWirePart({ text: 'hi', metadata: { kagent_thought: true } }),
    ).toEqual({
      kind: 'text',
      text: 'hi',
      metadata: { kagent_thought: true },
    });
    expect(
      toWirePart({
        data: { name: 'x' },
        metadata: { kagent_type: 'function_call' },
      }),
    ).toEqual({
      kind: 'data',
      data: { name: 'x' },
      metadata: { kagent_type: 'function_call' },
    });
    expect(
      toWirePart({
        url: 'https://x/y.png',
        mediaType: 'image/png',
        filename: 'y.png',
      }),
    ).toEqual({
      kind: 'file',
      file: { uri: 'https://x/y.png', mimeType: 'image/png', name: 'y.png' },
    });
    expect(
      toWirePart({ raw: 'AAAA', mediaType: 'application/octet-stream' }),
    ).toEqual({
      kind: 'file',
      file: { bytes: 'AAAA', mimeType: 'application/octet-stream' },
    });
    expect(toWirePart('not a part')).toBeUndefined();
  });

  it('translates a message with its role as a word', () => {
    const message = toWireMessage({
      messageId: 'm1',
      role: 'ROLE_AGENT',
      parts: [{ text: 'a' }, { text: 'b' }],
      taskId: 't1',
      contextId: 'c1',
    })!;
    expect(message).toEqual({
      kind: 'message',
      messageId: 'm1',
      role: 'agent',
      parts: [
        { kind: 'text', text: 'a' },
        { kind: 'text', text: 'b' },
      ],
      taskId: 't1',
      contextId: 'c1',
    });
  });
});

describe('tasks recorded on kagent-4a91c273', () => {
  it('is told apart from a 0.10 envelope', () => {
    expect(isA2aV1TaskList(tasks)).toBe(true);
    expect(isA2aV1TaskList(v0Tasks)).toBe(false);
  });

  it('normalizes into the one internal task shape the readers parse', () => {
    const { tasks: normalized, drift } = normalizeTaskList(tasks);

    expect(drift).toBeUndefined();
    expect(normalized).toHaveLength(1);
    const [task] = normalized;
    expect(task.status?.state).toBe('completed');
    expect(readNewestTaskState(normalized)?.state.key).toBe('completed');

    // History is the user's message, the agent's tool-call message and the
    // agent's output (an artifact on the wire), in timeline order.
    const roles = (task.history as Wire[]).map(entry => entry.role);
    expect(roles[0]).toBe('user');
    expect(roles.slice(1).every(role => role === 'agent')).toBe(true);
    const output = (task.history as Wire[]).at(-1)!;
    expect((output.parts as Wire[])[0]).toEqual(
      expect.objectContaining({
        kind: 'text',
        text: expect.stringContaining('namespaces'),
      }),
    );
    // The usage rides on the agent's output, under the prefix the readers know.
    expect(readTokenUsage(output.metadata)).toEqual(
      expect.objectContaining({
        prompt: expect.any(Number),
        completion: expect.any(Number),
      }),
    );
  });

  it('keeps tool calls readable as function_call / function_response data parts', () => {
    const { tasks: normalized } = normalizeTaskList(tasks);
    const parts = (normalized[0].history as Wire[])
      .flatMap(entry => (entry.parts as unknown[]) ?? [])
      .map(parsePart)
      .filter(Boolean);
    const call = parts.find(part => part && isFunctionCallPart(part))!;
    const response = parts.find(part => part && isFunctionResponsePart(part))!;
    expect(call).toBeDefined();
    expect(response).toBeDefined();
    expect(readFunctionCall(call).name).toBe('call_tool');
  });

  it('sums usage over a v1 conversation exactly as over a 0.10 one', () => {
    const { tasks: normalized } = normalizeTaskList(tasks);
    const usage = reduceSessionUsage(normalized, {
      startMs: Date.parse('2026-09-01T00:00:00Z'),
      endMs: Date.parse('2026-12-01T00:00:00Z'),
    });
    expect(usage.tally.turns).toBe(1);
    expect(usage.tally.inputTokens).toBeGreaterThan(0);
    expect(usage.tally.toolCalls).toBe(1);
    // The proxied call is attributed to its muster server.
    expect([...usage.servers.keys()]).toEqual(['kubernetes']);
  });

  it('treats an instance without a turn as an empty list, not drift', () => {
    expect(normalizeTaskList({ totalSize: 0 })).toEqual({ tasks: [] });
    expect(normalizeTaskList({ tasks: [] })).toEqual({ tasks: [] });
  });

  it('skips a task it cannot read and says so', () => {
    const { tasks: normalized, drift } = normalizeTaskList({
      tasks: [null, tasks.tasks[0]],
    });
    expect(normalized).toHaveLength(1);
    expect(drift).toEqual({
      kind: 'skipped-rows',
      message: 'skipped 1 unreadable task row',
    });
  });

  it('renders a canceled turn with its terminal state', () => {
    const task = toWireTask(canceled)!;
    expect(task.status).toEqual(expect.objectContaining({ state: 'canceled' }));
    expect(
      describeSessionState((task.status as Wire).state as string)?.isActive,
    ).toBe(false);
  });
});

describe('human in the loop on the v1 wire', () => {
  it('turns a typed approval request into the confirmation call the readers render', () => {
    const { tasks: normalized } = normalizeTaskList(hitlApproval);
    const [task] = normalized;

    expect(task.status?.state).toBe('input-required');
    const prompt = task.status?.message as Wire;
    expect(prompt.role).toBe('agent');
    const parts = (prompt.parts as Wire[]).map(parsePart);
    // The hint stays as prose; the request becomes an ADK-style confirmation of
    // the proposed call, which is what the answer panel and the timeline read.
    expect(parts[0]).toEqual(expect.objectContaining({ kind: 'text' }));
    const confirmation = parts.find(part => part && isFunctionCallPart(part))!;
    const call = readFunctionCall(confirmation);
    expect(call.name).toBe(CONFIRMATION_TOOL_NAME);
    const request =
      hitlApproval.tasks[0].status.message.metadata[HITL_EXTENSION_URI];
    expect(call.id).toBe(request.tools[0].id);
    expect(call.args).toEqual(
      expect.objectContaining({
        originalFunctionCall: expect.objectContaining({
          id: request.tools[0].call_id,
          name: request.tools[0].name,
          args: request.tools[0].args,
        }),
      }),
    );
  });

  it('turns a question into an ask_user confirmation carrying the questions', () => {
    const message = toWireMessage({
      messageId: 'm1',
      role: 'ROLE_AGENT',
      parts: [{ text: 'Which cluster?' }],
      extensions: [HITL_EXTENSION_URI],
      metadata: {
        [HITL_EXTENSION_URI]: {
          type: 'ask_user_request',
          id: 'ask-1',
          questions: [
            {
              question: 'Which cluster?',
              choices: ['a', 'b'],
              multiple: false,
            },
          ],
        },
      },
    })!;
    const confirmation = (message.parts as Wire[])
      .map(parsePart)
      .find(part => part && isFunctionCallPart(part))!;
    expect(readFunctionCall(confirmation)).toEqual({
      id: 'ask-1',
      name: CONFIRMATION_TOOL_NAME,
      args: {
        originalFunctionCall: {
          id: 'ask-1',
          name: 'ask_user',
          args: {
            questions: [
              {
                question: 'Which cluster?',
                choices: ['a', 'b'],
                multiple: false,
              },
            ],
          },
        },
      },
    });
  });

  it('turns the decision on a reply into the decision_type part the timeline resolves', () => {
    const rejected = toWireMessage({
      messageId: 'm2',
      role: 'ROLE_USER',
      parts: [{ text: 'no' }],
      taskId: 't1',
      extensions: [HITL_EXTENSION_URI],
      metadata: {
        [HITL_EXTENSION_URI]: {
          type: 'tool_approval_response',
          approvals: [
            { id: 'a', approved: false, rejection_reason: 'not today' },
          ],
        },
      },
    })!;
    expect((rejected.parts as Wire[]).at(-1)).toEqual({
      kind: 'data',
      data: { decision_type: 'reject', rejection_reason: 'not today' },
    });

    const answered = toWireMessage({
      messageId: 'm3',
      role: 'ROLE_USER',
      parts: [],
      extensions: [HITL_EXTENSION_URI],
      metadata: {
        [HITL_EXTENSION_URI]: {
          type: 'ask_user_response',
          id: 'ask-1',
          answers: [{ answer: ['a'] }],
        },
      },
    })!;
    expect((answered.parts as Wire[]).at(-1)).toEqual({
      kind: 'data',
      data: { decision_type: 'approve', ask_user_answers: [{ answer: ['a'] }] },
    });
  });

  it('leaves a pause without a typed request as prose only', () => {
    // HITL not negotiated on that turn: the controller sends the hint alone.
    const message = toWireMessage({
      messageId: 'm1',
      role: 'ROLE_AGENT',
      parts: [
        { text: 'Human input is required before the agent can continue.' },
      ],
    })!;
    expect(message.parts).toHaveLength(1);
  });
});

describe('stream recorded on kagent-4a91c273', () => {
  it('is told apart from a legacy event', () => {
    expect(isA2aV1StreamResponse(stream[0])).toBe(true);
    expect(isA2aV1StreamResponse({ kind: 'task', id: 't' })).toBe(false);
    expect(normalizeStreamEvent({ kind: 'task', id: 't' })).toEqual({
      kind: 'task',
      id: 't',
    });
  });

  it('translates the frames into the kind-discriminated events the reducer reads, deriving final', () => {
    const events = stream.map(toWireStreamEvent) as Wire[];

    expect(events.map(event => event.kind)).toEqual([
      'task',
      'status-update',
      'artifact-update',
      'artifact-update',
      'artifact-update',
      'status-update',
    ]);
    expect(events[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        status: expect.objectContaining({ state: 'submitted' }),
      }),
    );
    expect(events[1]).toEqual(
      expect.objectContaining({
        status: expect.objectContaining({ state: 'working' }),
        final: false,
      }),
    );
    expect(events[2]).toEqual(
      expect.objectContaining({
        taskId: expect.any(String),
        append: true,
        lastChunk: false,
        artifact: expect.objectContaining({
          parts: [expect.objectContaining({ kind: 'text' })],
        }),
      }),
    );
    expect(events[4]).toEqual(expect.objectContaining({ lastChunk: true }));
    expect(events[5]).toEqual(
      expect.objectContaining({
        status: expect.objectContaining({ state: 'completed' }),
        final: true,
      }),
    );
  });

  it('marks a pause as final too, so the reducer ends the live view', () => {
    expect(
      toWireStreamEvent({
        statusUpdate: {
          taskId: 't',
          contextId: 'c',
          status: { state: 'TASK_STATE_INPUT_REQUIRED' },
        },
      }),
    ).toEqual(expect.objectContaining({ kind: 'status-update', final: true }));
  });

  it('reports a frame it cannot read as undefined, never throwing', () => {
    expect(toWireStreamEvent({ something: 'else' })).toBeUndefined();
    expect(toWireStreamEvent(null)).toBeUndefined();
  });
});
