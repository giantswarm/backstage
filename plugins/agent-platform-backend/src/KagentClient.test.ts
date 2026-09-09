import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  Code,
  ConnectError,
  createRouterTransport,
  type ConnectRouter,
} from '@connectrpc/connect';
import {
  A2AService,
  Role,
  StreamResponseSchema,
  TaskSchema,
  TaskState,
  type SendMessageRequest,
  type StreamResponse,
} from './kagent/gen/a2a_pb';
import {
  AgentInstanceSchema,
  AgentInstanceService,
  AgentInstanceState,
  type AgentInstance,
} from './kagent/gen/kagent/api/v1alpha1/agent_instances_pb';
import {
  AgentTemplateSchema,
  AgentTemplateService,
} from './kagent/gen/kagent/api/v1alpha1/agent_templates_pb';
import { SystemService } from './kagent/gen/kagent/api/v1alpha1/system_pb';
import {
  deriveKagentApiBaseUrl,
  isTransportFailure,
  KagentClient,
  readKagentInstallationsFromConfig,
  TURN_PENDING_ERROR_NAME,
} from './KagentClient';

const installation = { name: 'gazelle', apiBaseUrl: 'https://kagent.test' };
const logger = mockServices.logger.mock();

/** An unsigned JWT whose payload carries the given claims. */
function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`;
}

const TOKEN = jwt({ sub: 'dex-sub', email: 'dev@lab.local' });
const NOW = new Date('2026-09-09T15:35:42.000Z');

function instance(overrides: Partial<AgentInstance> = {}): AgentInstance {
  const base = create(AgentInstanceSchema, {
    id: '01a086cf-7f84-761d-980a-48f485eded5e',
    creator: 'dev@lab.local',
    harness: { namespace: 'kagent', name: 'kagent' },
    agentTemplate: { namespace: 'kagent', name: 'muster-whole' },
    state: AgentInstanceState.READY,
    createdAt: timestampFromDate(NOW),
    updatedAt: timestampFromDate(NOW),
    name: 'Cluster health check',
    contextId: 'b61c731a-75e6-43e6-92cf-6f478680c09e',
  });
  return { ...base, ...overrides };
}

function template(harnesses: Array<{ harness: string; ready: boolean }>) {
  return create(AgentTemplateSchema, {
    ref: { namespace: 'kagent', name: 'muster-whole' },
    description: 'Muster, whole server',
    modelConfigRef: { namespace: 'kagent', name: 'default-model-config' },
    admittingHarnesses: harnesses.map(h => h.harness),
    resource: {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'AgentTemplate',
      value: {
        metadata: { name: 'muster-whole', namespace: 'kagent' },
        status: {
          harnesses: harnesses.map(h => ({
            harness: h.harness,
            conditions: [
              { type: 'Accepted', status: 'True' },
              { type: 'Ready', status: h.ready ? 'True' : 'False' },
            ],
          })),
        },
      },
    },
  });
}

function task(
  id: string,
  at: Date,
  text: { user: string; agent: string },
  state = TaskState.COMPLETED,
) {
  return create(TaskSchema, {
    id,
    contextId: 'b61c731a-75e6-43e6-92cf-6f478680c09e',
    status: { state, timestamp: timestampFromDate(at) },
    history: [
      {
        messageId: `${id}-user`,
        role: Role.USER,
        parts: [{ content: { case: 'text', value: text.user } }],
        metadata: { 'kagent.dev/timeline-position': at.toISOString() },
      },
    ],
    artifacts: [
      {
        artifactId: `${id}-artifact`,
        parts: [{ content: { case: 'text', value: text.agent } }],
        metadata: {
          adk_author: 'muster_whole_kagent',
          adk_usage_metadata: { promptTokenCount: 700, candidatesTokenCount: 11 },
          'kagent.dev/timeline-position': new Date(
            at.getTime() + 1_000,
          ).toISOString(),
        },
      },
    ],
  });
}

type Seen = { headers: Headers[] };

/**
 * A client over an in-memory controller. `routes` registers whichever service
 * implementations a test needs; every call's request headers are collected in
 * `seen` so identity forwarding can be asserted.
 */
function clientWith(routes: (router: ConnectRouter, seen: Seen) => void) {
  const seen: Seen = { headers: [] };
  const transport = createRouterTransport(router => routes(router, seen), {
    transport: {
      interceptors: [
        next => async req => {
          seen.headers.push(req.header);
          return next(req);
        },
      ],
    },
  });
  return {
    client: new KagentClient(installation, logger, transport, 200, 300),
    seen,
  };
}

describe('deriveKagentApiBaseUrl', () => {
  it('derives the controller host without an /api suffix', () => {
    expect(deriveKagentApiBaseUrl('gazelle.example.io')).toBe(
      'https://kagent.gazelle.example.io',
    );
  });

  it('is undefined without a base domain', () => {
    expect(deriveKagentApiBaseUrl(undefined)).toBeUndefined();
  });
});

describe('readKagentInstallationsFromConfig', () => {
  it('prefers an explicit apiBaseUrl and strips its trailing slash', () => {
    const config = new ConfigReader({
      gs: { installations: { gazelle: { baseDomain: 'gazelle.example.io' } } },
      agentPlatform: {
        kagent: {
          installations: {
            gazelle: { apiBaseUrl: 'https://agentgateway.example.io/kagent/' },
          },
        },
      },
    });
    expect([...readKagentInstallationsFromConfig(config, logger).values()]).toEqual(
      [{ name: 'gazelle', apiBaseUrl: 'https://agentgateway.example.io/kagent' }],
    );
  });
});

describe('KagentClient identity', () => {
  it('forwards the bearer and derives x-user-id from the token email', async () => {
    const { client, seen } = clientWith(router => {
      router.service(AgentInstanceService, {
        listAgentInstances: async () => ({ agentInstances: [instance()] }),
      });
    });

    await client.listSessions({ userToken: TOKEN });

    expect(seen.headers[0].get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(seen.headers[0].get('x-user-id')).toBe('dev@lab.local');
  });

  it('prefers an explicit user id over the token claim', async () => {
    const { client, seen } = clientWith(router => {
      router.service(AgentInstanceService, {
        listAgentInstances: async () => ({ agentInstances: [] }),
      });
    });

    await client.listSessions({ userToken: TOKEN, userId: 'other@lab.local' });

    expect(seen.headers[0].get('x-user-id')).toBe('other@lab.local');
  });
});

describe('KagentClient sessions', () => {
  it('lists instances as 0.10 session rows in the envelope', async () => {
    const { client } = clientWith(router => {
      router.service(AgentInstanceService, {
        listAgentInstances: async () => ({ agentInstances: [instance()] }),
      });
    });

    const result = (await client.listSessions({ userToken: TOKEN })) as {
      error: boolean;
      data: Record<string, unknown>[];
    };

    expect(result.error).toBe(false);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: '01a086cf-7f84-761d-980a-48f485eded5e',
      name: 'Cluster health check',
      user_id: 'dev@lab.local',
      created_at: NOW.toISOString(),
      // The 0.10 "python identifier" encoding the frontend joins agents on.
      agent_id: 'kagent__NS__muster_whole',
      source: 'user',
      harness: { namespace: 'kagent', name: 'kagent' },
      state: 'ready',
    });
  });

  it('creates an instance on the first harness that reports the template Ready', async () => {
    let created: unknown;
    const { client } = clientWith(router => {
      router.service(AgentTemplateService, {
        getAgentTemplate: async () => ({
          agentTemplate: template([
            { harness: 'claude', ready: false },
            { harness: 'kagent', ready: true },
          ]),
        }),
      });
      router.service(AgentInstanceService, {
        createAgentInstance: async req => {
          created = req;
          return { agentInstance: instance({ name: req.name }) };
        },
      });
    });

    const result = (await client.createSession(
      { namespace: 'kagent', name: 'muster-whole' },
      'Cluster health check',
      { userToken: TOKEN },
    )) as { data: { id: string; name: string } };

    expect(created).toMatchObject({
      harness: { namespace: 'kagent', name: 'kagent' },
      agentTemplate: { namespace: 'kagent', name: 'muster-whole' },
      name: 'Cluster health check',
    });
    expect((created as { requestId: string }).requestId).toMatch(/[0-9a-f-]{36}/);
    expect(result.data.id).toBe('01a086cf-7f84-761d-980a-48f485eded5e');
  });

  it('honours an explicitly named harness without reading the template', async () => {
    let created: unknown;
    const { client } = clientWith(router => {
      router.service(AgentInstanceService, {
        createAgentInstance: async req => {
          created = req;
          return { agentInstance: instance() };
        },
      });
    });

    await client.createSession(
      { namespace: 'kagent', name: 'muster-whole', harness: 'claude' },
      'x',
      { userToken: TOKEN },
    );

    expect(created).toMatchObject({ harness: { name: 'claude' } });
  });

  it('answers 409 when no harness admits the template', async () => {
    const { client } = clientWith(router => {
      router.service(AgentTemplateService, {
        getAgentTemplate: async () => ({ agentTemplate: template([]) }),
      });
    });

    await expect(
      client.createSession({ namespace: 'kagent', name: 'muster-whole' }, 'x', {
        userToken: TOKEN,
      }),
    ).rejects.toMatchObject({ name: 'ConflictError' });
  });

  it('reads one instance as {data: {session}}', async () => {
    const { client } = clientWith(router => {
      router.service(AgentInstanceService, {
        getAgentInstance: async req => {
          expect(req.agentInstanceId).toBe('01a086cf-7f84-761d-980a-48f485eded5e');
          return { agentInstance: instance() };
        },
      });
    });

    const result = (await client.getSession('01a086cf-7f84-761d-980a-48f485eded5e', {
      userToken: TOKEN,
    })) as { data: { session: { id: string } } };

    expect(result.data.session.id).toBe('01a086cf-7f84-761d-980a-48f485eded5e');
  });

  it('maps a missing instance to a 404 with the endpoint wording', async () => {
    const { client } = clientWith(router => {
      router.service(AgentInstanceService, {
        getAgentInstance: async () => {
          throw new ConnectError('agent instance not found', Code.NotFound);
        },
      });
    });

    await expect(
      client.getSession('gone', { userToken: TOKEN }),
    ).rejects.toMatchObject({
      name: 'NotFoundError',
      message: expect.stringContaining('does not exist'),
    });
  });

  it('renames and deletes through the instance service', async () => {
    const calls: string[] = [];
    const { client } = clientWith(router => {
      router.service(AgentInstanceService, {
        updateAgentInstanceName: async req => {
          calls.push(`rename:${req.name}`);
          return { agentInstance: instance({ name: req.name }) };
        },
        deleteAgentInstance: async req => {
          calls.push(`delete:${req.agentInstanceId}`);
          return { agentInstance: instance() };
        },
      });
    });

    await client.updateSessionName('id-1', 'New name', { userToken: TOKEN });
    await client.deleteSession('id-1', { userToken: TOKEN });

    expect(calls).toEqual(['rename:New name', 'delete:id-1']);
  });

  it('answers 400 for a name kagent rejects', async () => {
    const { client } = clientWith(router => {
      router.service(AgentInstanceService, {
        updateAgentInstanceName: async () => {
          throw new ConnectError('name: must not end in whitespace', Code.InvalidArgument);
        },
      });
    });

    await expect(
      client.updateSessionName('id-1', 'x ', { userToken: TOKEN }),
    ).rejects.toMatchObject({ name: 'InputError' });
  });
});

describe('KagentClient tasks', () => {
  it('lists tasks oldest first as v0 tasks, folding artifacts into history', async () => {
    const { client, seen } = clientWith(router => {
      router.service(A2AService, {
        listTasks: async () => ({
          tasks: [
            task('t2', new Date(NOW.getTime() + 60_000), {
              user: 'And then?',
              agent: 'Then this.',
            }),
            task('t1', NOW, { user: 'Say hello.', agent: 'Hello.' }),
          ],
          nextPageToken: '',
          pageSize: 2,
          totalSize: 2,
        }),
      });
    });

    const result = (await client.listSessionTasks('inst-1', {
      userToken: TOKEN,
    })) as { data: Array<Record<string, any>> };

    expect(seen.headers[0].get('x-kagent-agent-instance-id')).toBe('inst-1');
    expect(result.data.map(t => t.id)).toEqual(['t1', 't2']);

    const first = result.data[0];
    expect(first).toMatchObject({
      kind: 'task',
      contextId: 'b61c731a-75e6-43e6-92cf-6f478680c09e',
      status: { state: 'completed', timestamp: NOW.toISOString() },
    });
    expect(first.history).toEqual([
      expect.objectContaining({
        kind: 'message',
        messageId: 't1-user',
        role: 'user',
        parts: [expect.objectContaining({ kind: 'text', text: 'Say hello.' })],
      }),
      expect.objectContaining({
        kind: 'message',
        messageId: 't1-artifact',
        role: 'agent',
        taskId: 't1',
        parts: [expect.objectContaining({ kind: 'text', text: 'Hello.' })],
        metadata: expect.objectContaining({
          adk_usage_metadata: { promptTokenCount: 700, candidatesTokenCount: 11 },
        }),
      }),
    ]);
  });

  it('spells every task state the way the v0 wire did', async () => {
    const { client } = clientWith(router => {
      router.service(A2AService, {
        listTasks: async () => ({
          tasks: [
            task('a', NOW, { user: 'u', agent: 'a' }, TaskState.INPUT_REQUIRED),
            task('b', NOW, { user: 'u', agent: 'a' }, TaskState.FAILED),
            task('c', NOW, { user: 'u', agent: 'a' }, TaskState.WORKING),
          ],
          nextPageToken: '',
          pageSize: 3,
          totalSize: 3,
        }),
      });
    });

    const result = (await client.listSessionTasks('inst-1', {
      userToken: TOKEN,
    })) as { data: Array<{ status: { state: string } }> };

    expect(result.data.map(t => t.status.state)).toEqual([
      'input-required',
      'failed',
      'working',
    ]);
  });
});

describe('KagentClient sendMessage', () => {
  it('sends the text as ROLE_USER with the instance header and answers the v0 task', async () => {
    let sent: SendMessageRequest | undefined;
    const { client, seen } = clientWith(router => {
      router.service(A2AService, {
        sendMessage: async req => {
          sent = req;
          return {
            payload: {
              case: 'task',
              value: task('t9', NOW, { user: 'Hi', agent: 'Hello there.' }),
            },
          };
        },
      });
    });

    const result = (await client.sendMessage(
      'inst-1',
      { namespace: 'kagent', name: 'muster-whole' },
      { messageId: 'm-1', text: 'Hi' },
      { userToken: TOKEN },
    )) as { result: Record<string, any> };

    expect(seen.headers[0].get('x-kagent-agent-instance-id')).toBe('inst-1');
    expect(seen.headers[0].get('x-user-id')).toBe('dev@lab.local');
    expect(sent?.message).toMatchObject({
      messageId: 'm-1',
      role: Role.USER,
      parts: [{ content: { case: 'text', value: 'Hi' } }],
      taskId: '',
    });
    expect(result.result).toMatchObject({
      kind: 'task',
      id: 't9',
      status: { state: 'completed' },
    });
  });

  it('reports a timed-out turn as pending once the message is in the history', async () => {
    const { client } = clientWith(router => {
      router.service(A2AService, {
        sendMessage: async () => {
          throw new ConnectError('deadline exceeded', Code.DeadlineExceeded);
        },
        listTasks: async () => ({
          tasks: [
            create(TaskSchema, {
              id: 't1',
              status: { state: TaskState.WORKING },
              history: [{ messageId: 'm-1', role: Role.USER, parts: [] }],
            }),
          ],
          nextPageToken: '',
          pageSize: 1,
          totalSize: 1,
        }),
      });
    });

    await expect(
      client.sendMessage(
        'inst-1',
        { namespace: 'kagent', name: 'x' },
        { messageId: 'm-1', text: 'Hi' },
        { userToken: TOKEN },
      ),
    ).rejects.toMatchObject({ name: TURN_PENDING_ERROR_NAME });
  });

  it('still reports a timed-out turn as pending when the history cannot confirm it — kagent decided, not the wire', async () => {
    const { client } = clientWith(router => {
      router.service(A2AService, {
        sendMessage: async () => {
          throw new ConnectError('deadline exceeded', Code.DeadlineExceeded);
        },
        listTasks: async () => ({
          tasks: [],
          nextPageToken: '',
          pageSize: 0,
          totalSize: 0,
        }),
      });
    });

    await expect(
      client.sendMessage(
        'inst-1',
        { namespace: 'kagent', name: 'x' },
        { messageId: 'm-1', text: 'Hi' },
        { userToken: TOKEN },
      ),
    ).rejects.toMatchObject({ name: TURN_PENDING_ERROR_NAME });
  });

  it('answers a confirmation by resuming the named task with a data part', async () => {
    let sent: SendMessageRequest | undefined;
    const { client } = clientWith(router => {
      router.service(A2AService, {
        sendMessage: async req => {
          sent = req;
          return {
            payload: {
              case: 'task',
              value: task('t1', NOW, { user: 'yes', agent: 'done' }),
            },
          };
        },
      });
    });

    await client.answerConfirmation(
      'inst-1',
      { namespace: 'kagent', name: 'x' },
      {
        messageId: 'm-2',
        taskId: 't1',
        decision: 'approve',
        answers: [['blue']],
        text: 'blue',
      },
      { userToken: TOKEN },
    );

    expect(sent?.message?.taskId).toBe('t1');
    expect(sent?.message?.extensions).toEqual([
      'https://kagent.dev/extensions/hitl/v1',
    ]);
    const dataPart = sent?.message?.parts[0];
    expect(dataPart?.content.case).toBe('data');
    expect(sent?.message?.parts[1]?.content).toEqual({
      case: 'text',
      value: 'blue',
    });
  });
});

describe('KagentClient streamMessage', () => {
  async function frames(response: Response): Promise<Record<string, any>[]> {
    const text = await response.text();
    return text
      .split('\n\n')
      .filter(Boolean)
      .map(line => JSON.parse(line.replace(/^data: /, '')));
  }

  it('relays the streaming turn as v0 SSE frames', async () => {
    const { client } = clientWith(router => {
      router.service(A2AService, {
        async *sendStreamingMessage(): AsyncGenerator<StreamResponse> {
          yield create(StreamResponseSchema, {
            payload: {
              case: 'task',
              value: {
                id: 't1',
                contextId: 'ctx',
                status: { state: TaskState.SUBMITTED },
              },
            },
          });
          yield create(StreamResponseSchema, {
            payload: {
              case: 'artifactUpdate',
              value: {
                taskId: 't1',
                contextId: 'ctx',
                artifact: {
                  artifactId: 'a1',
                  parts: [{ content: { case: 'text', value: 'Hel' } }],
                },
                append: false,
                lastChunk: false,
              },
            },
          });
          yield create(StreamResponseSchema, {
            payload: {
              case: 'statusUpdate',
              value: {
                taskId: 't1',
                contextId: 'ctx',
                status: { state: TaskState.COMPLETED },
              },
            },
          });
        },
      });
    });

    const response = await client.streamMessage(
      'inst-1',
      { namespace: 'kagent', name: 'x' },
      { messageId: 'm-1', text: 'Hi' },
      { userToken: TOKEN },
      new AbortController().signal,
    );

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = await frames(response);
    expect(events.map(e => e.result.kind)).toEqual([
      'task',
      'artifact-update',
      'status-update',
    ]);
    expect(events[0]).toMatchObject({ jsonrpc: '2.0', id: 'm-1' });
    expect(events[1].result.artifact.parts[0]).toEqual({ kind: 'text', text: 'Hel' });
    expect(events[2].result).toMatchObject({
      status: { state: 'completed' },
      final: true,
    });
  });

  it('surfaces a rejection before the first event as an error', async () => {
    const { client } = clientWith(router => {
      router.service(A2AService, {
        // eslint-disable-next-line require-yield
        async *sendStreamingMessage(): AsyncGenerator<StreamResponse> {
          throw new ConnectError('no such instance', Code.NotFound);
        },
      });
    });

    await expect(
      client.streamMessage(
        'inst-1',
        { namespace: 'kagent', name: 'x' },
        { messageId: 'm-1', text: 'Hi' },
        { userToken: TOKEN },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('KagentClient error mapping', () => {
  function failingWith(code: Code, message: string) {
    return clientWith(router => {
      router.service(AgentInstanceService, {
        listAgentInstances: async () => {
          throw new ConnectError(message, code);
        },
      });
    }).client;
  }

  it('maps Unauthenticated to a 401', async () => {
    await expect(
      failingWith(Code.Unauthenticated, 'nope').listSessions({ userToken: TOKEN }),
    ).rejects.toMatchObject({ name: 'AuthenticationError' });
  });

  it('maps PermissionDenied to a 403', async () => {
    await expect(
      failingWith(Code.PermissionDenied, 'nope').listSessions({ userToken: TOKEN }),
    ).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('maps a socket-level Unavailable to a transport-borne 404', async () => {
    const error: Error = await failingWith(
      Code.Unavailable,
      'connect ECONNREFUSED 10.0.0.1:443',
    )
      .listSessions({ userToken: TOKEN })
      .then(
        () => new Error('resolved'),
        (e: unknown) => e as Error,
      );
    expect(error.name).toBe('NotFoundError');
    expect(isTransportFailure(error)).toBe(true);
  });

  it('maps a gateway Unavailable to an upstream failure', async () => {
    await expect(
      failingWith(Code.Unavailable, 'HTTP 503').listSessions({ userToken: TOKEN }),
    ).rejects.toMatchObject({ name: 'UpstreamError' });
  });

  it('maps Internal to an upstream failure', async () => {
    await expect(
      failingWith(Code.Internal, 'boom').listSessions({ userToken: TOKEN }),
    ).rejects.toMatchObject({ name: 'UpstreamError' });
  });
});

describe('KagentClient system', () => {
  it('reads the version', async () => {
    const { client } = clientWith(router => {
      router.service(SystemService, {
        getVersion: async () => ({
          kagentVersion: 'v0.0.1-poc',
          gitCommit: '13579e9f',
          buildDate: '2026-09-09',
        }),
      });
    });

    expect(await client.getVersion()).toEqual({
      kagent_version: 'v0.0.1-poc',
      git_commit: '13579e9f',
      build_date: '2026-09-09',
    });
  });

  it('reports the identity kagent resolved, falling back to the user id sent', async () => {
    const { client } = clientWith(router => {
      router.service(SystemService, {
        getCurrentUser: async () => ({ claims: { sub: 'dev@lab.local' } }),
      });
    });

    expect(await client.getMe({ userToken: TOKEN })).toEqual({
      sub: 'dev@lab.local',
    });
  });

  it('lists templates with their harness readiness', async () => {
    const { client } = clientWith(router => {
      router.service(AgentTemplateService, {
        listAgentTemplates: async () => ({
          agentTemplates: [
            template([
              { harness: 'kagent', ready: true },
              { harness: 'claude', ready: false },
            ]),
          ],
        }),
      });
    });

    const result = (await client.listAgentTemplates('kagent', {
      userToken: TOKEN,
    })) as { data: Array<Record<string, any>> };

    expect(result.data[0]).toMatchObject({
      ref: { namespace: 'kagent', name: 'muster-whole' },
      description: 'Muster, whole server',
      harnesses: [
        { name: 'kagent', ready: true },
        { name: 'claude', ready: false },
      ],
      ready: true,
    });
    expect(result.data[0].resource.status.harnesses).toHaveLength(2);
  });
});
