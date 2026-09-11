import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import {
  AGENT_INSTANCE_HEADER,
  deriveKagentApiBaseUrl,
  harnessesOf,
  isTransportFailure,
  KagentClient,
  readKagentInstallationsFromConfig,
  TURN_PENDING_ERROR_NAME,
} from './KagentClient';
import { create } from '@bufbuild/protobuf';
import { AgentTemplateSchema } from './kagent/gen/kagent/api/v1alpha1/agent_templates_pb';
import { A2A_EXTENSIONS_HEADER, HITL_EXTENSION_URI } from './kagent/hitl';
import {
  createFakeController,
  FakeControllerOptions,
  TurnScript,
} from './kagent/testing/fakeController';

const installation = { name: 'gazelle', apiBaseUrl: 'https://kagent.test' };
const logger = mockServices.logger.mock();
const USER = { userToken: 'user-token' };
const OTHER = { userToken: 'other-token' };
const AGENT = { namespace: 'kagent', name: 'sre-agent' };
const TEMPLATES: NonNullable<FakeControllerOptions['templates']> = [
  {
    namespace: 'kagent',
    name: 'sre-agent',
    harnesses: [
      { name: 'claude', ready: false },
      { name: 'kagent', ready: true },
    ],
  },
  { namespace: 'kagent', name: 'orphan', harnesses: [] },
];

/** A client wired to a fresh fake controller over an in-memory transport. */
function build(options: FakeControllerOptions = {}) {
  const fake = createFakeController({ templates: TEMPLATES, ...options });
  const client = new KagentClient(
    installation,
    logger,
    createRouterTransport(fake.routes),
    500,
    800,
  );
  return { fake, client };
}

/** Create an instance and return its id. */
async function created(
  client: KagentClient,
  requestId = 'req-1',
  options = USER,
): Promise<string> {
  const body = (await client.createSession(
    AGENT,
    'Ingress check',
    requestId,
    options,
  )) as {
    agentInstance: { id: string };
  };
  return body.agentInstance.id;
}

/** Drain a streaming Response into its SSE `data:` payloads, parsed. */
async function frames(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map(frame => {
      expect(frame.startsWith('data: ')).toBe(true);
      return JSON.parse(frame.slice('data: '.length));
    });
}

describe('deriveKagentApiBaseUrl', () => {
  it('derives the gRPC origin on the kagent hostname, with no path', () => {
    expect(deriveKagentApiBaseUrl('gazelle.example.io')).toBe(
      'https://kagent.gazelle.example.io',
    );
    expect(deriveKagentApiBaseUrl(undefined)).toBeUndefined();
  });
});

describe('readKagentInstallationsFromConfig', () => {
  it('derives one origin per installation with a baseDomain', () => {
    const config = new ConfigReader({
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example.io' },
          noDomain: {},
        },
      },
    });
    const result = readKagentInstallationsFromConfig(config, logger);
    expect([...result.values()]).toEqual([
      { name: 'gazelle', apiBaseUrl: 'https://kagent.gazelle.example.io' },
    ]);
  });

  it('treats an explicit block as the allowlist, stripping a trailing slash', () => {
    const config = new ConfigReader({
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example.io' },
          golem: { baseDomain: 'golem.example.io' },
        },
      },
      agentPlatform: {
        kagent: {
          installations: {
            golem: { apiBaseUrl: 'http://kagent-controller.kagent.svc:8083/' },
            lab: { apiBaseUrl: 'kagent-controller.kagent.svc:8083' },
          },
        },
      },
    });
    const result = readKagentInstallationsFromConfig(config, logger);
    expect([...result.values()]).toEqual([
      { name: 'golem', apiBaseUrl: 'http://kagent-controller.kagent.svc:8083' },
    ]);
    // `lab` had no scheme and was skipped with a warning; `gazelle` is not in
    // the allowlist.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("installation 'lab'"),
      expect.anything(),
    );
  });
});

describe('KagentClient against a fake controller', () => {
  describe('identity', () => {
    it('sends the bearer and never an identity header, on every RPC', async () => {
      const { fake, client } = build();
      const id = await created(client);
      await client.listSessions(USER);
      await client.getSession(id, USER);
      await client.updateSessionName(id, 'Renamed', USER);
      await client.listSessionTasks(id, USER);
      await client.getMe(USER);
      await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'hi' },
        USER,
      );
      const response = await client.streamMessage(
        id,
        AGENT,
        { messageId: 'm2', text: 'hi again' },
        USER,
        new AbortController().signal,
      );
      await frames(response);
      await client.deleteSession(id, USER);

      const services = new Set(
        fake.calls.map(call => `${call.service}/${call.method}`),
      );
      expect(services).toEqual(
        new Set([
          'AgentTemplateService/GetAgentTemplate',
          'AgentInstanceService/CreateAgentInstance',
          'AgentInstanceService/ListAgentInstances',
          'AgentInstanceService/GetAgentInstance',
          'AgentInstanceService/UpdateAgentInstanceName',
          'A2AService/ListTasks',
          'SystemService/GetCurrentUser',
          'A2AService/SendMessage',
          'A2AService/SendStreamingMessage',
          'AgentInstanceService/DeleteAgentInstance',
        ]),
      );
      for (const call of fake.calls) {
        expect(call.headers.authorization).toBe('Bearer user-token');
        // D4: the gateway derives the identity from the verified token and drops
        // any inbound identity header. Sending one would be dead weight at best
        // and impersonation at worst, so the client never does: no `x-user-id`,
        // and no other `x-` header than the instance route on the A2A calls.
        expect(call.headers['x-user-id']).toBeUndefined();
        expect(
          Object.keys(call.headers).filter(
            name => name.startsWith('x-') && name !== AGENT_INSTANCE_HEADER,
          ),
        ).toEqual([]);
      }
    });

    it('maps a refused token to an AuthenticationError', async () => {
      const { client } = build();
      await expect(
        client.listSessions({ userToken: 'nope' }),
      ).rejects.toMatchObject({
        name: 'AuthenticationError',
      });
      await expect(client.getMe({})).rejects.toMatchObject({
        name: 'AuthenticationError',
      });
    });

    it('answers the claims the controller resolved for the caller', async () => {
      const { client } = build();
      await expect(client.getMe(USER)).resolves.toEqual({
        sub: 'dev@lab.local',
      });
      await expect(client.getMe(OTHER)).resolves.toEqual({
        sub: 'other@lab.local',
      });
    });
  });

  describe('sessions are AgentInstances', () => {
    it('creates an instance on the Ready harness and answers the proto JSON', async () => {
      const { fake, client } = build();

      const body = (await client.createSession(
        AGENT,
        'Ingress check',
        'req-1',
        USER,
      )) as {
        agentInstance: Record<string, unknown>;
      };

      expect(body.agentInstance).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          creator: 'dev@lab.local',
          name: 'Ingress check',
          state: 'AGENT_INSTANCE_STATE_READY',
          harness: { namespace: 'kagent', name: 'kagent' },
          agentTemplate: { namespace: 'kagent', name: 'sre-agent' },
          contextId: expect.any(String),
          createdAt: expect.any(String),
        }),
      );
      // The Ready harness was picked from the template's status, not guessed.
      expect(
        fake.instances.get(body.agentInstance.id as string)?.harness?.name,
      ).toBe('kagent');
    });

    it('creates once for a repeated request_id and refuses a reuse with other parameters', async () => {
      const { fake, client } = build();

      const first = await created(client, 'req-idem');
      const second = await created(client, 'req-idem');

      expect(second).toBe(first);
      expect(fake.instances.size).toBe(1);

      await expect(
        client.createSession(
          { namespace: 'kagent', name: 'orphan' },
          'x',
          'req-idem',
          USER,
        ),
      ).rejects.toMatchObject({ name: 'ConflictError' });
    });

    it('refuses to start a session on a template no harness admits, as a 409', async () => {
      const { client } = build();
      await expect(
        client.createSession(
          { namespace: 'kagent', name: 'orphan' },
          'x',
          'req-2',
          USER,
        ),
      ).rejects.toMatchObject({
        name: 'ConflictError',
        message: expect.stringContaining('No Harness admits'),
      });
    });

    it('reports an unknown template as a 404 and a rejected name as a 400', async () => {
      const { client } = build();
      await expect(
        client.createSession(
          { namespace: 'kagent', name: 'nope' },
          'x',
          'req-3',
          USER,
        ),
      ).rejects.toMatchObject({ name: 'NotFoundError' });
      await expect(
        client.createSession(AGENT, ' padded ', 'req-4', USER),
      ).rejects.toMatchObject({ name: 'InputError' });
    });

    it('lists only the caller’s instances, walking every page', async () => {
      const { client } = build();
      for (let i = 0; i < 3; i += 1) {
        await created(client, `mine-${i}`);
      }
      await created(client, 'theirs', OTHER);

      const mine = (await client.listSessions(USER)) as {
        agentInstances: { creator: string }[];
      };
      const theirs = (await client.listSessions(OTHER)) as {
        agentInstances: { creator: string }[];
      };

      expect(mine.agentInstances).toHaveLength(3);
      expect(
        mine.agentInstances.every(i => i.creator === 'dev@lab.local'),
      ).toBe(true);
      expect(theirs.agentInstances).toHaveLength(1);
    });

    it('narrows the listing to one template on request', async () => {
      const { client } = build({
        templates: [
          ...TEMPLATES,
          {
            namespace: 'kagent',
            name: 'other',
            harnesses: [{ name: 'kagent', ready: true }],
          },
        ],
      });
      await created(client, 'a');
      await client.createSession(
        { namespace: 'kagent', name: 'other' },
        'o',
        'b',
        USER,
      );

      const narrowed = (await client.listSessions(USER, {
        agentTemplate: { namespace: 'kagent', name: 'other' },
      })) as { agentInstances: { agentTemplate: { name: string } }[] };

      expect(narrowed.agentInstances.map(i => i.agentTemplate.name)).toEqual([
        'other',
      ]);
    });

    it('answers an empty listing without an agentInstances key, which is an empty list', async () => {
      const { client } = build();
      expect(await client.listSessions(USER)).toEqual({});
    });

    it('reads, renames and deletes one instance, scoped to the caller', async () => {
      const { fake, client } = build();
      const id = await created(client);

      expect(await client.getSession(id, USER)).toEqual({
        agentInstance: expect.objectContaining({ id, name: 'Ingress check' }),
      });
      // Somebody else's instance is indistinguishable from a missing one.
      await expect(client.getSession(id, OTHER)).rejects.toMatchObject({
        name: 'NotFoundError',
      });

      expect(await client.updateSessionName(id, 'Renamed', USER)).toEqual({
        agentInstance: expect.objectContaining({ id, name: 'Renamed' }),
      });
      await expect(
        client.updateSessionName(id, 'x'.repeat(201), USER),
      ).rejects.toMatchObject({ name: 'InputError' });

      expect(await client.deleteSession(id, USER)).toEqual({
        agentInstance: expect.objectContaining({
          id,
          state: 'AGENT_INSTANCE_STATE_DELETING',
        }),
      });
      expect(fake.instances.has(id)).toBe(false);
      await expect(client.getSession(id, USER)).rejects.toMatchObject({
        name: 'NotFoundError',
      });
    });
  });

  describe('turns over A2A v1', () => {
    it('streams the turn as SSE frames of StreamResponse JSON, routed by the instance header with HITL requested', async () => {
      const { fake, client } = build();
      const id = await created(client);

      const response = await client.streamMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'why is the ingress failing?' },
        USER,
        new AbortController().signal,
      );

      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      );
      const events = (await frames(response)) as Record<string, unknown>[];
      expect(events[0]).toEqual({
        task: expect.objectContaining({
          id: expect.any(String),
          status: expect.objectContaining({ state: 'TASK_STATE_SUBMITTED' }),
          history: [
            expect.objectContaining({ messageId: 'm1', role: 'ROLE_USER' }),
          ],
        }),
      });
      expect(events[1]).toEqual({
        statusUpdate: expect.objectContaining({
          status: expect.objectContaining({ state: 'TASK_STATE_WORKING' }),
        }),
      });
      expect(events.filter(e => 'artifactUpdate' in e)).toHaveLength(3);
      expect(events.at(-1)).toEqual({
        statusUpdate: expect.objectContaining({
          status: expect.objectContaining({ state: 'TASK_STATE_COMPLETED' }),
        }),
      });

      const stream = fake.calls.find(
        call => call.method === 'SendStreamingMessage',
      )!;
      expect(stream.headers[AGENT_INSTANCE_HEADER]).toBe(id);
      expect(stream.headers[A2A_EXTENSIONS_HEADER]).toBe(HITL_EXTENSION_URI);
    });

    it('answers the finished task for a unary send', async () => {
      const { client } = build();
      const id = await created(client);

      const body = (await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'hello' },
        USER,
      )) as { task: Record<string, unknown> };

      expect(body.task).toEqual(
        expect.objectContaining({
          status: expect.objectContaining({ state: 'TASK_STATE_COMPLETED' }),
          artifacts: [
            expect.objectContaining({ artifactId: expect.any(String) }),
          ],
        }),
      );
    });

    it('lists the conversation oldest first, shaped as asked', async () => {
      const { client } = build();
      const id = await created(client);
      await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'one' },
        USER,
      );
      await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm2', text: 'two' },
        USER,
      );

      const full = (await client.listSessionTasks(id, USER)) as {
        tasks: { history: unknown[]; artifacts: unknown[] }[];
        totalSize: number;
      };
      expect(full.totalSize).toBe(2);
      expect(
        full.tasks.map(t => (t.history[0] as { messageId: string }).messageId),
      ).toEqual(['m1', 'm2']);
      expect(full.tasks[0].artifacts).toHaveLength(1);

      const statusOnly = (await client.listSessionTasks(id, USER, {
        historyLength: 0,
        includeArtifacts: false,
      })) as { tasks: Record<string, unknown>[] };
      expect(statusOnly.tasks[0].history).toBeUndefined();
      expect(statusOnly.tasks[0].artifacts).toBeUndefined();
      expect(statusOnly.tasks[0].status).toEqual(
        expect.objectContaining({ state: 'TASK_STATE_COMPLETED' }),
      );
    });

    it('reads one task by id with the instance header', async () => {
      const { fake, client } = build();
      const id = await created(client);
      const sent = (await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'one' },
        USER,
      )) as {
        task: { id: string };
      };

      const task = (await client.getTask(id, sent.task.id, USER)) as {
        id: string;
      };

      expect(task.id).toBe(sent.task.id);
      expect(fake.calls.at(-1)?.headers[AGENT_INSTANCE_HEADER]).toBe(id);
    });

    it('refuses a second message during a turn as a 409', async () => {
      const { client } = build({ turn: () => ({ kind: 'long' }) });
      const id = await created(client);
      const first = client.streamMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'long' },
        USER,
        new AbortController().signal,
      );
      await first;

      await expect(
        client.sendMessage(id, AGENT, { messageId: 'm2', text: 'again' }, USER),
      ).rejects.toMatchObject({
        name: 'ConflictError',
        message: expect.stringContaining('still working'),
      });
    });

    it('cancels a running turn server-side and reports the task canceled', async () => {
      const { fake, client } = build({
        turn: ({ message }) =>
          message.parts[0]?.content.case === 'text' &&
          message.parts[0].content.value === 'take your time'
            ? { kind: 'long' }
            : { kind: 'reply', text: 'Back to work.' },
      });
      const id = await created(client);
      // Not awaited: the in-memory router transport hands the stream over only
      // once the handler returns, and the handler returns on the cancel. (The
      // h2c suite reads the stream live and cancels mid-way.)
      const streaming = client.streamMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'take your time' },
        USER,
        new AbortController().signal,
      );
      let taskId: string | undefined;
      for (let attempt = 0; attempt < 50 && !taskId; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
        taskId = fake.tasks.get(id)?.[0]?.task.id;
      }
      expect(taskId).toBeDefined();

      const canceled = (await client.cancelTask(id, taskId!, USER)) as {
        status: { state: string };
      };

      expect(canceled.status.state).toBe('TASK_STATE_CANCELED');
      // The stream sees the turn end, and a cancel of a finished turn is a no-op
      // answering the task as it is.
      const events = (await frames(await streaming)) as Record<
        string,
        unknown
      >[];
      expect(JSON.stringify(events.at(-1))).toContain('TASK_STATE_CANCELED');
      const again = (await client.cancelTask(id, taskId!, USER)) as {
        status: { state: string };
      };
      expect(again.status.state).toBe('TASK_STATE_CANCELED');
      // The instance takes a following turn.
      const next = (await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm2', text: 'next' },
        USER,
      )) as {
        task: { status: { state: string } };
      };
      expect(next.task.status.state).toBe('TASK_STATE_COMPLETED');
    });

    it('ends a stream that dies mid-turn with one error frame', async () => {
      const { client } = build({
        turn: () => ({ kind: 'fail', reason: 'model_not_found' }),
      });
      const id = await created(client);

      const response = await client.streamMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'x' },
        USER,
        new AbortController().signal,
      );
      const events = (await frames(response)) as Record<string, unknown>[];

      // A failed turn is a terminal status update, not a broken stream.
      expect(events.at(-1)).toEqual({
        statusUpdate: expect.objectContaining({
          status: expect.objectContaining({
            state: 'TASK_STATE_FAILED',
            message: expect.objectContaining({
              parts: [{ text: 'model_not_found' }],
            }),
          }),
        }),
      });
    });

    it('maps a rejection before the stream opens to the caller’s error', async () => {
      const { client } = build();
      await expect(
        client.streamMessage(
          'not-an-instance',
          AGENT,
          { messageId: 'm1', text: 'x' },
          USER,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ name: 'NotFoundError' });
    });
  });

  describe('human in the loop', () => {
    const approval: TurnScript = {
      kind: 'hitl',
      request: {
        type: 'tool_approval_request',
        hint: 'The agent wants to run a tool.',
        tools: [
          {
            id: 'appr-1',
            call_id: 'call-1',
            name: 'x_kubernetes_delete',
            args: { name: 'pod-a' },
          },
        ],
      },
    };
    const question: TurnScript = {
      kind: 'hitl',
      request: {
        type: 'ask_user_request',
        id: 'ask-1',
        questions: [
          {
            question: 'Which cluster?',
            choices: ['gazelle', 'golem'],
            multiple: false,
          },
          { question: 'Why?' },
        ],
      },
    };

    it('pauses the turn with the typed request, because the extension was requested', async () => {
      const { client } = build({ turn: () => approval });
      const id = await created(client);

      const body = (await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'delete it' },
        USER,
      )) as {
        task: { status: { state: string; message: Record<string, unknown> } };
      };

      expect(body.task.status.state).toBe('TASK_STATE_INPUT_REQUIRED');
      expect(body.task.status.message.extensions).toEqual([HITL_EXTENSION_URI]);
      expect(
        (body.task.status.message.metadata as Record<string, unknown>)[
          HITL_EXTENSION_URI
        ],
      ).toEqual(expect.objectContaining({ type: 'tool_approval_request' }));
    });

    it('resumes the paused task with the decision built from the recorded request', async () => {
      const { fake, client } = build({ turn: () => approval });
      const id = await created(client);
      const paused = (await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'delete it' },
        USER,
      )) as {
        task: { id: string };
      };

      const resumed = (await client.answerConfirmation(
        id,
        AGENT,
        {
          messageId: 'm2',
          taskId: paused.task.id,
          decision: 'reject',
          rejectionReason: 'not today',
        },
        USER,
      )) as {
        task: {
          id: string;
          status: { state: string };
          history: Record<string, unknown>[];
        };
      };

      expect(resumed.task.id).toBe(paused.task.id);
      expect(resumed.task.status.state).toBe('TASK_STATE_COMPLETED');
      const reply = resumed.task.history.at(-1)!;
      expect(reply.taskId).toBe(paused.task.id);
      expect(reply.extensions).toEqual([HITL_EXTENSION_URI]);
      expect(
        (reply.metadata as Record<string, unknown>)[HITL_EXTENSION_URI],
      ).toEqual({
        type: 'tool_approval_response',
        approvals: [
          { id: 'appr-1', approved: false, rejection_reason: 'not today' },
        ],
      });
      // The transcript carries a rendering of the decision when no words were given.
      expect(reply.parts).toEqual([{ text: 'Rejected.' }]);
      // The reply was routed to the instance and asked for the extension too.
      const send = fake.calls
        .filter(call => call.method === 'SendMessage')
        .at(-1)!;
      expect(send.headers[AGENT_INSTANCE_HEADER]).toBe(id);
      expect(send.headers[A2A_EXTENSIONS_HEADER]).toBe(HITL_EXTENSION_URI);
    });

    it('answers a question positionally and refuses a mismatched answer count', async () => {
      const { client } = build({ turn: () => question });
      const id = await created(client);
      const paused = (await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'go' },
        USER,
      )) as {
        task: { id: string };
      };

      await expect(
        client.answerConfirmation(
          id,
          AGENT,
          {
            messageId: 'm2',
            taskId: paused.task.id,
            decision: 'approve',
            answers: [['gazelle']],
          },
          USER,
        ),
      ).rejects.toMatchObject({
        name: 'InputError',
        message: expect.stringContaining('2 question(s)'),
      });

      const resumed = (await client.answerConfirmation(
        id,
        AGENT,
        {
          messageId: 'm3',
          taskId: paused.task.id,
          decision: 'approve',
          answers: [['gazelle'], ['because']],
          text: 'gazelle, because',
        },
        USER,
      )) as {
        task: { status: { state: string }; history: Record<string, unknown>[] };
      };

      expect(resumed.task.status.state).toBe('TASK_STATE_COMPLETED');
      expect(
        (resumed.task.history.at(-1)!.metadata as Record<string, unknown>)[
          HITL_EXTENSION_URI
        ],
      ).toEqual({
        type: 'ask_user_response',
        id: 'ask-1',
        answers: [{ answer: ['gazelle'] }, { answer: ['because'] }],
      });
    });

    it('refuses to answer a task that is not waiting, as a 409', async () => {
      const { client } = build();
      const id = await created(client);
      const done = (await client.sendMessage(
        id,
        AGENT,
        { messageId: 'm1', text: 'x' },
        USER,
      )) as {
        task: { id: string };
      };
      await expect(
        client.answerConfirmation(
          id,
          AGENT,
          { messageId: 'm2', taskId: done.task.id, decision: 'approve' },
          USER,
        ),
      ).rejects.toMatchObject({ name: 'ConflictError' });
    });
  });

  describe('failure mapping', () => {
    it('reports a socket-level failure as a transport-borne 404', async () => {
      const client = new KagentClient(
        { name: 'nowhere', apiBaseUrl: 'http://127.0.0.1:1' },
        logger,
        undefined,
        500,
        500,
      );
      const error = (await client
        .listSessions(USER)
        .catch((e: unknown) => e)) as Error;
      expect(error.name).toBe('NotFoundError');
      expect(isTransportFailure(error)).toBe(true);
    });

    it('reports a turn that outlives its timeout as pending once the message landed', async () => {
      const { client } = build({ turn: () => ({ kind: 'long' }) });
      const id = await created(client);

      const error = (await client
        .sendMessage(id, AGENT, { messageId: 'm1', text: 'slow' }, USER)
        .catch((e: unknown) => e)) as Error;

      expect(error.name).toBe(TURN_PENDING_ERROR_NAME);
    });

    it('does not verify a decision away', async () => {
      const { client } = build();
      const error = (await client
        .sendMessage('missing', AGENT, { messageId: 'm1', text: 'x' }, USER)
        .catch((e: unknown) => e)) as Error;
      expect(error.name).toBe('NotFoundError');
      expect(isTransportFailure(error)).toBe(false);
    });

    it('reports a controller that lacks an RPC as a 404 naming the endpoint', async () => {
      const client = new KagentClient(
        installation,
        logger,
        createRouterTransport(() => {}),
        500,
        500,
      );
      await expect(client.getMe(USER)).rejects.toMatchObject({
        name: 'NotFoundError',
        message: expect.stringContaining('current user'),
      });
    });

    it('keeps a Connect failure it cannot classify as an upstream error', async () => {
      const client = new KagentClient(
        installation,
        logger,
        createRouterTransport(router => {
          router.service(
            (
              require('./kagent/gen/kagent/api/v1alpha1/system_pb') as typeof import('./kagent/gen/kagent/api/v1alpha1/system_pb')
            ).SystemService,
            {
              getCurrentUser() {
                throw new ConnectError('database down', Code.Internal);
              },
            },
          );
        }),
        500,
        500,
      );
      await expect(client.getMe(USER)).rejects.toMatchObject({
        name: 'UpstreamError',
        message: expect.stringContaining('database down'),
      });
    });
  });
});

describe('harnessesOf', () => {
  it('lists Ready harnesses first, then the rest of the status, then admitting ones without status', () => {
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

  it('is empty for a template nothing admits', () => {
    expect(harnessesOf(create(AgentTemplateSchema, {}))).toEqual([]);
  });
});
