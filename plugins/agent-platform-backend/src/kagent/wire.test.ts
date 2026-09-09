import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  PartSchema,
  StreamResponseSchema,
  TaskSchema,
  TaskState,
} from './gen/a2a_pb';
import { AgentTemplateSchema } from './gen/kagent/api/v1alpha1/agent_templates_pb';
import {
  harnessesOf,
  sortTasksOldestFirst,
  toV0Part,
  toV0StreamEvent,
  toV0Task,
} from './wire';

describe('toV0Part', () => {
  it('renders a text part', () => {
    expect(
      toV0Part(create(PartSchema, { content: { case: 'text', value: 'hi' } })),
    ).toEqual({ kind: 'text', text: 'hi' });
  });

  it('renders a data part as plain JSON with its metadata', () => {
    const part = create(PartSchema, {
      content: {
        case: 'data',
        value: {
          kind: {
            case: 'structValue',
            value: {
              fields: {
                name: { kind: { case: 'stringValue', value: 'ask_user' } },
              },
            },
          },
        },
      },
      metadata: { adk_type: 'function_call' },
    });
    expect(toV0Part(part)).toEqual({
      kind: 'data',
      data: { name: 'ask_user' },
      metadata: { adk_type: 'function_call' },
    });
  });

  it('renders a url part as a v0 file part', () => {
    const part = create(PartSchema, {
      content: { case: 'url', value: 'https://x/y.png' },
      mediaType: 'image/png',
      filename: 'y.png',
    });
    expect(toV0Part(part)).toEqual({
      kind: 'file',
      file: { uri: 'https://x/y.png', mimeType: 'image/png', name: 'y.png' },
    });
  });

  it('drops an empty metadata object', () => {
    expect(
      toV0Part(
        create(PartSchema, { content: { case: 'text', value: 'x' }, metadata: {} }),
      ),
    ).toEqual({ kind: 'text', text: 'x' });
  });
});

describe('toV0Task', () => {
  it('orders history and artifacts by timeline position', () => {
    const task = create(TaskSchema, {
      id: 't',
      contextId: 'c',
      history: [
        {
          messageId: 'u2',
          parts: [{ content: { case: 'text', value: 'second question' } }],
          metadata: { 'kagent.dev/timeline-position': '2026-09-09T10:00:02Z' },
        },
        {
          messageId: 'u1',
          parts: [{ content: { case: 'text', value: 'first question' } }],
          metadata: { 'kagent.dev/timeline-position': '2026-09-09T10:00:00Z' },
        },
      ],
      artifacts: [
        {
          artifactId: 'a1',
          parts: [{ content: { case: 'text', value: 'first answer' } }],
          metadata: { 'kagent.dev/timeline-position': '2026-09-09T10:00:01Z' },
        },
      ],
    });
    const history = toV0Task(task).history as Array<{ messageId: string }>;
    expect(history.map(m => m.messageId)).toEqual(['u1', 'a1', 'u2']);
  });

  it('keeps arrival order when positions are missing', () => {
    const task = create(TaskSchema, {
      id: 't',
      history: [{ messageId: 'u1', parts: [] }],
      artifacts: [{ artifactId: 'a1', parts: [] }],
    });
    const history = toV0Task(task).history as Array<{ messageId: string }>;
    expect(history.map(m => m.messageId)).toEqual(['u1', 'a1']);
  });
});

describe('sortTasksOldestFirst', () => {
  it('sorts by status timestamp, oldest first', () => {
    const at = (s: number) => timestampFromDate(new Date(s * 1000));
    const tasks = [
      create(TaskSchema, { id: 'b', status: { timestamp: at(2) } }),
      create(TaskSchema, { id: 'a', status: { timestamp: at(1) } }),
      create(TaskSchema, { id: 'c', status: { timestamp: at(3) } }),
    ];
    expect(sortTasksOldestFirst(tasks).map(t => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('toV0StreamEvent', () => {
  it('marks a terminal status update final and a working one not', () => {
    const working = create(StreamResponseSchema, {
      payload: {
        case: 'statusUpdate',
        value: { taskId: 't', contextId: 'c', status: { state: TaskState.WORKING } },
      },
    });
    const done = create(StreamResponseSchema, {
      payload: {
        case: 'statusUpdate',
        value: {
          taskId: 't',
          contextId: 'c',
          status: { state: TaskState.INPUT_REQUIRED },
        },
      },
    });
    expect(toV0StreamEvent(working)).toMatchObject({
      kind: 'status-update',
      status: { state: 'working' },
      final: false,
    });
    expect(toV0StreamEvent(done)).toMatchObject({
      status: { state: 'input-required' },
      final: true,
    });
  });
});

describe('harnessesOf', () => {
  it('lists Ready harnesses first and admitting ones without status last', () => {
    const template = create(AgentTemplateSchema, {
      admittingHarnesses: ['claude', 'kagent', 'codex'],
      resource: {
        value: {
          status: {
            harnesses: [
              {
                harness: 'claude',
                conditions: [{ type: 'Ready', status: 'False' }],
              },
              {
                harness: 'kagent',
                conditions: [{ type: 'Ready', status: 'True' }],
              },
            ],
          },
        },
      },
    });
    expect(harnessesOf(template)).toEqual([
      { name: 'kagent', ready: true },
      { name: 'claude', ready: false },
      { name: 'codex', ready: false },
    ]);
  });

  it('is empty when nothing admits the template', () => {
    expect(harnessesOf(create(AgentTemplateSchema, {}))).toEqual([]);
  });
});
