import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { mockServices } from '@backstage/backend-test-utils';
import { ServiceUnavailableError } from '@backstage/errors';
import {
  experimental_createMCPClient as createMCPClient,
  MCPClient,
} from '@ai-sdk/mcp';
import { MusterMcpClient } from './MusterMcpClient';

const SESSION_HEADER_REQUIRED =
  'mcp: session header is required for non-initialize requests';
const SESSION_NOT_FOUND = 'mcp: session not found';

/** What `@ai-sdk/mcp`'s http transport throws for a non-2xx answer. */
function transportError(status: number, body: string) {
  const error = new Error(
    `MCP HTTP Transport Error: POSTing to endpoint (HTTP ${status}): ${body}`,
  ) as Error & { statusCode?: number };
  error.name = 'MCPClientError';
  error.statusCode = status;
  return error;
}

/** muster's call_tool envelope around a wrapped tool's JSON payload. */
function callToolResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        }),
      },
    ],
  };
}

describe('MusterMcpClient session recovery (unit)', () => {
  const logger = mockServices.logger.mock();

  beforeEach(() => jest.clearAllMocks());

  function fakeMcpClient(execute: jest.Mock): MCPClient {
    return {
      toolsFromDefinitions: jest.fn(
        ({ tools }: { tools: { name: string }[] }) =>
          Object.fromEntries(tools.map(tool => [tool.name, { execute }])),
      ),
      close: jest.fn(),
    } as unknown as MCPClient;
  }

  function buildClient(executes: jest.Mock[]) {
    const factory = jest.fn(async () => fakeMcpClient(executes.shift()!));
    const client = new MusterMcpClient(
      { name: 'gazelle', url: 'http://muster/mcp' },
      logger,
      factory,
    );
    return { client, factory };
  }

  it('retries once on a fresh client when the id-less request is answered 400', async () => {
    const first = jest
      .fn()
      .mockRejectedValue(transportError(400, SESSION_HEADER_REQUIRED));
    const second = jest.fn().mockResolvedValue(callToolResult({ pools: [] }));
    const { client, factory } = buildClient([first, second]);

    await expect(client.callTool('x_cm_list_node_pools', {})).resolves.toEqual({
      pools: [],
    });
    expect(factory).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('retries once when the gateway forgot the session (404) or the client is closed', async () => {
    for (const lost of [
      transportError(404, SESSION_NOT_FOUND),
      new Error('Attempted to send a request from a closed client'),
    ]) {
      const first = jest.fn().mockRejectedValue(lost);
      const second = jest.fn().mockResolvedValue(callToolResult({ ok: true }));
      const { client, factory } = buildClient([first, second]);

      await expect(client.callTool('x_cm_list_clusters', {})).resolves.toEqual({
        ok: true,
      });
      expect(factory).toHaveBeenCalledTimes(2);
    }
  });

  it('answers in plain words, never the transport text, when the retry fails too', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(transportError(400, SESSION_HEADER_REQUIRED));
    const { client, factory } = buildClient([execute, execute]);

    const failure = await client.callTool('x_cm_list_node_pools', {}).then(
      () => undefined,
      (error: Error) => error,
    );
    expect(failure).toBeInstanceOf(ServiceUnavailableError);
    expect(failure?.message).toBe(
      'gazelle did not answer: the MCP session was lost and could not be re-established',
    );
    expect(failure?.message).not.toMatch(/session header is required|MCP HTTP/);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('logs a recovered lost session at info, with the installation in the metadata', async () => {
    const first = jest
      .fn()
      .mockRejectedValue(transportError(404, SESSION_NOT_FOUND));
    const second = jest.fn().mockResolvedValue(callToolResult({ ok: true }));
    const { client } = buildClient([first, second]);

    await client.callTool('x_cm_list_clusters', {});

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Muster MCP session was lost; re-initializing and retrying once',
      {
        installation: 'gazelle',
        cause: expect.stringContaining(SESSION_NOT_FOUND),
      },
    );
  });

  describe('a session lost on most requests', () => {
    afterEach(() => jest.useRealTimers());

    async function loseAndRecover(client: MusterMcpClient, times: number) {
      for (let i = 0; i < times; i++) {
        await client.callTool('x_cm_list_clusters', {});
      }
    }

    /**
     * Every MCP client answers its first request and has lost its session by
     * the next one, so each request after the first loses the cached
     * client's session and recovers on a fresh one.
     */
    async function lostOnEveryRequest() {
      const executes = Array.from({ length: 50 }, () =>
        jest
          .fn()
          .mockResolvedValueOnce(callToolResult({ ok: true }))
          .mockRejectedValue(transportError(404, SESSION_NOT_FOUND)),
      );
      const { client } = buildClient(executes);
      await client.callTool('x_cm_list_clusters', {});
      return client;
    }

    const FREQUENT_WARNING =
      'Muster MCP sessions are lost often; requests re-initialize before they run';

    it('warns once ten recovered losses fall within ten minutes, and not again in that window', async () => {
      jest.useFakeTimers({ now: 0 });
      const client = await lostOnEveryRequest();

      await loseAndRecover(client, 9);
      expect(logger.warn).not.toHaveBeenCalled();

      await loseAndRecover(client, 1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(FREQUENT_WARNING, {
        installation: 'gazelle',
        lostSessions: 10,
        windowMinutes: 10,
      });

      await loseAndRecover(client, 10);
      expect(logger.warn).toHaveBeenCalledTimes(1);

      // Ten minutes on, the idle cached client is replaced without a loss;
      // the ten requests after it lose theirs, so the warning comes again.
      jest.setSystemTime(10 * 60_000);
      await loseAndRecover(client, 11);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('stays quiet when the losses are spread out', async () => {
      jest.useFakeTimers({ now: 0 });
      const client = await lostOnEveryRequest();

      for (let i = 0; i < 20; i++) {
        jest.setSystemTime(i * 2 * 60_000);
        await loseAndRecover(client, 1);
      }
      expect(
        logger.info.mock.calls.filter(
          ([message]) =>
            message ===
            'Muster MCP session was lost; re-initializing and retrying once',
        ).length,
      ).toBeGreaterThanOrEqual(15);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  it('warns about a failed request with the installation in the metadata, not the message', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(transportError(400, SESSION_HEADER_REQUIRED));
    const { client } = buildClient([execute, execute]);

    await expect(client.callTool('x_cm_list_node_pools', {})).rejects.toThrow(
      ServiceUnavailableError,
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Muster MCP request failed: the MCP session was lost and could not be re-established',
      {
        installation: 'gazelle',
        cause: expect.stringContaining(SESSION_HEADER_REQUIRED),
      },
    );
  });

  it('does not retry a tool-level error and passes it through unchanged', async () => {
    const execute = jest.fn().mockResolvedValue({
      content: [
        { type: 'text', text: 'pool has 2 replicas; scale to 0 first' },
      ],
      isError: true,
    });
    const { client, factory } = buildClient([execute]);

    await expect(client.callTool('x_cm_delete_node_pool', {})).rejects.toThrow(
      'pool has 2 replicas; scale to 0 first',
    );
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('keeps the transport 401 unchanged for the sign-in path', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(
        transportError(401, 'authentication failure: token expired'),
      );
    const { client, factory } = buildClient([execute]);

    await expect(client.callTool('x_cm_list_clusters', {})).rejects.toThrow(
      /HTTP 401/,
    );
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('puts any other transport failure into plain words without retrying', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(transportError(502, 'upstream connect error'));
    const { client, factory } = buildClient([execute]);

    await expect(client.callTool('x_cm_list_clusters', {})).rejects.toThrow(
      'gazelle did not answer: the muster endpoint answered HTTP 502',
    );
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

/**
 * A stateful streamable-http MCP server the way agentgateway's MCP proxy
 * behaves: `initialize` opens a session and hands out `mcp-session-id`; a
 * request with an id it does not know is answered 404 `session not found`; a
 * non-initialize request without the header 400 `session header is required
 * for non-initialize requests`. No standalone GET stream (405).
 */
class FakeGateway {
  readonly sessions = new Set<string>();
  readonly initializes: string[] = [];
  readonly toolCalls: (string | undefined)[] = [];
  private readonly server: Server;
  url = '';

  constructor() {
    this.server = createServer((req, res) => this.handle(req, res));
  }

  async start(): Promise<void> {
    await new Promise<void>(resolve =>
      this.server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${port}/mcp`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>(resolve => this.server.close(() => resolve()));
  }

  /** What an idle TTL, a roll or the other replica does: the sessions are gone. */
  forgetSessions(): void {
    this.sessions.clear();
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === 'GET') {
      res.writeHead(405).end();
      return;
    }
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (req.method === 'DELETE') {
      if (sessionId) this.sessions.delete(sessionId);
      res.writeHead(200).end();
      return;
    }
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const message = JSON.parse(body) as {
        id?: number | string;
        method?: string;
        params?: { protocolVersion?: string; name?: string };
      };
      if (message.method === 'initialize') {
        const id = randomUUID();
        this.sessions.add(id);
        this.initializes.push(id);
        this.json(res, 200, { 'mcp-session-id': id }, message.id, {
          protocolVersion: message.params?.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-gateway', version: '0' },
        });
        return;
      }
      if (!sessionId) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end(SESSION_HEADER_REQUIRED);
        return;
      }
      if (!this.sessions.has(sessionId)) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end(SESSION_NOT_FOUND);
        return;
      }
      if (message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      if (message.method === 'tools/call') {
        this.toolCalls.push(sessionId);
        this.json(
          res,
          200,
          {},
          message.id,
          callToolResult({ session: sessionId }),
        );
        return;
      }
      this.json(res, 200, {}, message.id, {});
    });
  }

  private json(
    res: ServerResponse,
    status: number,
    headers: Record<string, string>,
    id: number | string | undefined,
    result: unknown,
  ): void {
    res.writeHead(status, {
      'content-type': 'application/json',
      ...headers,
    });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  }
}

describe('MusterMcpClient against a gateway that forgets sessions', () => {
  const logger = mockServices.logger.mock();
  let gateway: FakeGateway;
  let client: MusterMcpClient;
  let sdkClients: MCPClient[];

  beforeEach(async () => {
    gateway = new FakeGateway();
    await gateway.start();
    sdkClients = [];
    client = new MusterMcpClient(
      { name: 'gazelle', url: gateway.url },
      logger,
      async headers => {
        const sdkClient = await createMCPClient({
          name: 'muster-backend-test',
          transport: { type: 'http', url: gateway.url, headers },
        });
        sdkClients.push(sdkClient);
        return sdkClient;
      },
    );
  });

  afterEach(async () => {
    await client.dispose();
    await gateway.stop();
  });

  it('re-initializes and succeeds on the next call after the gateway forgot the session (404)', async () => {
    const first = (await client.callTool('x_cm_list_node_pools', {})) as {
      session: string;
    };
    expect(gateway.initializes).toEqual([first.session]);

    gateway.forgetSessions();

    const second = (await client.callTool('x_cm_list_node_pools', {})) as {
      session: string;
    };
    expect(gateway.initializes).toHaveLength(2);
    expect(second.session).toBe(gateway.initializes[1]);
    expect(second.session).not.toBe(first.session);
    // The forgotten id was tried once (404), then the fresh session served.
    expect(gateway.toolCalls).toEqual([first.session, second.session]);
  });

  it('re-initializes instead of answering 400 when the transport already lost its session id', async () => {
    await client.callTool('x_cm_list_node_pools', {});
    expect(sdkClients).toHaveLength(1);

    // The standalone GET stream met the 404 first (what happened on
    // gazelle): the SDK clears the id and reports the error without closing.
    // `expireSessionId` is the transport's own method for that branch.
    const transport = (
      sdkClients[0] as unknown as {
        transport: { sessionId?: string; expireSessionId(id: string): void };
      }
    ).transport;
    const lostId = transport.sessionId!;
    gateway.forgetSessions();
    transport.expireSessionId(lostId);
    expect(transport.sessionId).toBeUndefined();

    const result = (await client.callTool('x_cm_list_node_pools', {})) as {
      session: string;
    };
    expect(result.session).toBe(gateway.initializes[1]);
    expect(gateway.initializes).toHaveLength(2);
    expect(sdkClients).toHaveLength(2);
  });

  it('serves the next call on the fresh session without another initialize', async () => {
    await client.callTool('x_cm_list_node_pools', {});
    gateway.forgetSessions();
    await client.callTool('x_cm_list_node_pools', {});
    await client.callTool('x_cm_list_node_pools', {});
    expect(gateway.initializes).toHaveLength(2);
    expect(sdkClients).toHaveLength(2);
  });
});
