import { mockServices } from '@backstage/backend-test-utils';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import http2 from 'http2';
import { AddressInfo } from 'net';
import { AGENT_INSTANCE_HEADER, KagentClient } from './KagentClient';
import { A2A_EXTENSIONS_HEADER, HITL_EXTENSION_URI } from './kagent/hitl';
import { probeKagentGrpc } from './kagent/reachability';
import { createFakeController } from './kagent/testing/fakeController';

/**
 * The transport for real: the fake controller behind a plaintext HTTP/2 (h2c)
 * server, spoken to over connect-node's native gRPC transport — the shape the
 * controller's `:8083` and the connectivity chart's route present. The
 * in-memory router transport the other suite uses skips the wire; this one
 * proves gRPC framing, HTTP/2 and the metadata actually cross it.
 */
describe('KagentClient over native gRPC (h2c)', () => {
  const logger = mockServices.logger.mock();
  const fake = createFakeController({
    templates: [
      {
        namespace: 'kagent',
        name: 'sre-agent',
        harnesses: [{ name: 'kagent', ready: true }],
      },
    ],
    turn: ({ message }) =>
      message.parts[0]?.content.case === 'text' &&
      message.parts[0].content.value === 'wait'
        ? { kind: 'long' }
        : { kind: 'reply', text: 'Streamed over h2c.' },
  });
  let server: http2.Http2Server;
  let origin: string;
  /** The raw HTTP/2 request headers, per request, as the socket saw them. */
  const rawHeaders: http2.IncomingHttpHeaders[] = [];

  beforeAll(async () => {
    const handler = connectNodeAdapter({ routes: fake.routes });
    server = http2.createServer((request, response) => {
      rawHeaders.push({ ...request.headers });
      handler(request, response);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  function client() {
    return new KagentClient(
      { name: 'lab', apiBaseUrl: origin },
      logger,
      undefined,
      2_000,
      2_000,
    );
  }

  it('creates, streams, cancels and lists over one HTTP/2 origin', async () => {
    const c = client();
    const options = { userToken: 'user-token' };

    const createdBody = (await c.createSession(
      { namespace: 'kagent', name: 'sre-agent' },
      'Over the wire',
      'req-h2c',
      options,
    )) as { agentInstance: { id: string } };
    const id = createdBody.agentInstance.id;

    const stream = await c.streamMessage(
      id,
      { namespace: 'kagent', name: 'sre-agent' },
      { messageId: 'm1', text: 'hello' },
      options,
      new AbortController().signal,
    );
    const text = await stream.text();
    expect(text).toContain('"state":"TASK_STATE_COMPLETED"');
    expect(text).toContain('Streamed over h2c.');

    const longTurn = await c.streamMessage(
      id,
      { namespace: 'kagent', name: 'sre-agent' },
      { messageId: 'm2', text: 'wait' },
      options,
      new AbortController().signal,
    );
    const reader = longTurn.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    const taskId = (
      JSON.parse(first.split('\n\n')[0].slice('data: '.length)) as {
        task: { id: string };
      }
    ).task.id;
    const canceled = (await c.cancelTask(id, taskId, options)) as {
      status: { state: string };
    };
    expect(canceled.status.state).toBe('TASK_STATE_CANCELED');
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }

    const tasks = (await c.listSessionTasks(id, options)) as {
      tasks: unknown[];
    };
    expect(tasks.tasks).toHaveLength(2);

    // Every request crossed as gRPC over HTTP/2 with the bearer and, on the A2A
    // calls, the instance header and the extension — and no identity header.
    expect(rawHeaders.length).toBeGreaterThan(0);
    for (const headers of rawHeaders) {
      expect(headers['content-type']).toMatch(/^application\/grpc/);
      expect(headers[':method']).toBe('POST');
      expect(headers.authorization).toBe('Bearer user-token');
      expect(headers['x-user-id']).toBeUndefined();
    }
    const a2a = rawHeaders.filter(h =>
      String(h[':path']).startsWith('/lf.a2a.v1.A2AService/'),
    );
    expect(a2a.length).toBeGreaterThanOrEqual(4);
    for (const headers of a2a) {
      expect(headers[AGENT_INSTANCE_HEADER]).toBe(id);
      expect(headers[A2A_EXTENSIONS_HEADER]).toBe(HITL_EXTENSION_URI);
    }
  });

  it('probes the origin as reachable with one unauthenticated call', async () => {
    // The fake refuses a missing token as the gateway does; a refusal is an
    // answer, and an answer is the proof.
    await expect(
      probeKagentGrpc(origin, { timeoutMs: 2_000 }),
    ).resolves.toEqual(expect.objectContaining({ reachable: true }));
    const probe = rawHeaders.at(-1)!;
    expect(probe[':path']).toBe(
      '/kagent.api.v1alpha1.SystemService/GetVersion',
    );
    expect(probe.authorization).toBeUndefined();
  });

  it('probes nothing listening as not reachable, with a reason from the code only', async () => {
    const result = await probeKagentGrpc('http://127.0.0.1:1', {
      timeoutMs: 2_000,
    });
    expect(result.reachable).toBe(false);
    expect(result.reason).toBe('connection refused (ECONNREFUSED)');
    expect(result.reason).not.toContain('127.0.0.1');
  });
});
