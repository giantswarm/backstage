import { mockServices } from '@backstage/backend-test-utils';
import { Code, ConnectError } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import http2 from 'http2';
import { AddressInfo } from 'net';
import { setTimeout as delay } from 'timers/promises';
import { KagentClient, TURN_PENDING_ERROR_NAME } from './KagentClient';
import { A2AService, TaskState } from './kagent/gen/a2a_pb';
import { SessionService } from './kagent/gen/kagent/api/v1alpha1/sessions_pb';
import { HITL_EXTENSION_URI } from './kagent/hitl';

describe('stream startup over native gRPC', () => {
  const agent = { namespace: 'kagent', name: 'review-agent' };
  const options = { userToken: 'user-token' };
  const message = { messageId: 'message-1', text: 'review this' };
  let server: http2.Http2Server;
  let client: KagentClient;
  let behavior:
    | 'restore'
    | 'accepted'
    | 'accepted-unavailable'
    | 'missing'
    | 'unreadable'
    | Code;
  let listed: number;
  let taskReads: {
    tenant: string;
    contextId: string;
    authorization: string | null;
  }[];
  let started: Promise<void>;
  let notifyStarted: () => void;
  let restore: () => void;
  let restored: Promise<void>;
  const connections = new Set<http2.ServerHttp2Session>();

  beforeAll(async () => {
    server = http2.createServer(
      connectNodeAdapter({
        routes(router) {
          router.service(SessionService, {
            getSession: () => ({
              session: { id: 'session-1', contextId: 'session-1', agent },
            }),
          });
          router.service(A2AService, {
            async *sendStreamingMessage(request, context) {
              notifyStarted();
              if (typeof behavior === 'number') {
                throw new ConnectError('refused', behavior);
              }
              if (behavior === 'accepted-unavailable') {
                throw new ConnectError('connection closed', Code.Unavailable);
              }
              if (behavior === 'restore') {
                await restored;
              } else {
                await new Promise<void>(resolve => {
                  context.signal.addEventListener('abort', () => resolve(), {
                    once: true,
                  });
                });
                return;
              }
              yield {
                payload: {
                  case: 'task',
                  value: {
                    id: 'task-1',
                    contextId: 'session-1',
                    history: [request.message!],
                  },
                },
              };
            },
            getTask: () => ({
              id: 'task-1',
              contextId: 'session-1',
              status: {
                state: TaskState.INPUT_REQUIRED,
                message: {
                  messageId: 'ask-1',
                  extensions: [HITL_EXTENSION_URI],
                  metadata: {
                    [HITL_EXTENSION_URI]: {
                      type: 'tool_approval_request',
                      tools: [{ id: 'tool-1', name: 'get_pods' }],
                    },
                  },
                },
              },
            }),
            listTasks(request, context) {
              listed += 1;
              taskReads.push({
                tenant: request.tenant,
                contextId: request.contextId,
                authorization: context.requestHeader.get('authorization'),
              });
              if (behavior === 'unreadable') {
                throw new ConnectError('read unavailable', Code.Unavailable);
              }
              return {
                tasks: [
                  {
                    id: 'task-1',
                    contextId: 'session-1',
                    history: [
                      {
                        messageId:
                          behavior === 'accepted' ||
                          behavior === 'accepted-unavailable'
                            ? message.messageId
                            : 'other',
                      },
                    ],
                  },
                ],
              };
            },
          });
        },
      }),
    );
    server.on('session', connection => {
      connections.add(connection);
      connection.on('close', () => connections.delete(connection));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    client = new KagentClient(
      {
        name: 'lab',
        apiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      },
      mockServices.logger.mock(),
      undefined,
      100,
      600,
    );
  });

  beforeEach(() => {
    listed = 0;
    taskReads = [];
    started = new Promise(resolve => {
      notifyStarted = resolve;
    });
    restored = new Promise(resolve => {
      restore = resolve;
    });
  });

  afterAll(async () => {
    connections.forEach(connection => connection.destroy());
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  function send(signal: AbortSignal) {
    return client.streamMessage('session-1', agent, message, options, signal);
  }

  it('waits through a restore longer than the read budget and relays the first task', async () => {
    behavior = 'restore';
    const control = new AbortController();
    const streaming = send(control.signal);
    const outcome = streaming.catch(error => error);
    try {
      await started;
      await delay(200);
      restore();
      const response = await outcome;
      expect(response).toBeInstanceOf(Response);
      expect(await response.text()).toContain('"id":"task-1"');
      expect(listed).toBe(0);
    } finally {
      restore();
      control.abort();
    }
  });

  describe.each(['message', 'answer'] as const)('%s stream', kind => {
    it.each([
      'accepted',
      'accepted-unavailable',
      'missing',
      'unreadable',
    ] as const)(
      'verifies the message after stream startup fails: %s',
      async scenario => {
        behavior = scenario;
        const control = new AbortController();
        try {
          const streaming =
            kind === 'message'
              ? send(control.signal)
              : client.streamAnswer(
                  'session-1',
                  agent,
                  {
                    messageId: message.messageId,
                    taskId: 'task-1',
                    decision: 'approve',
                  },
                  options,
                  control.signal,
                );
          const error = await streaming.catch(failure => failure);
          expect(error).toMatchObject(
            scenario.startsWith('accepted')
              ? { name: TURN_PENDING_ERROR_NAME }
              : { name: 'UpstreamError', reason: 'timeout' },
          );
          expect(error.message).not.toContain('30000ms');
          expect(listed).toBe(1);
          expect(taskReads).toEqual([
            {
              tenant: 'kagent/review-agent',
              contextId: 'session-1',
              authorization: 'Bearer user-token',
            },
          ]);
        } finally {
          control.abort();
        }
      },
    );
  });

  it.each([
    [Code.Unauthenticated, 'InstallationAuthenticationError'],
    [Code.PermissionDenied, 'NotAllowedError'],
    [Code.NotFound, 'NotFoundError'],
    [Code.FailedPrecondition, 'ConflictError'],
  ] as const)(
    'preserves a controller refusal (%s) without reading tasks',
    async (code, name) => {
      behavior = code;
      const control = new AbortController();
      try {
        await expect(send(control.signal)).rejects.toMatchObject({ name });
        expect(listed).toBe(0);
      } finally {
        control.abort();
      }
    },
  );

  it('does not verify or report a pending turn after the caller disconnects', async () => {
    behavior = 'missing';
    const control = new AbortController();
    const streaming = send(control.signal);
    const outcome = streaming.catch(error => error);
    await started;
    control.abort();
    expect(await outcome).toMatchObject({ code: Code.Canceled });
    expect(listed).toBe(0);
  });
});
