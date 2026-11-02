import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { mockServices } from '@backstage/backend-test-utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  MusterMcpClient,
  MusterToolError,
  MusterToolProgress,
} from './MusterMcpClient';

/** muster's call_tool envelope around a wrapped tool's MCP result. */
function envelope(inner: { text: string; isError?: boolean }) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          content: [{ type: 'text', text: inner.text }],
          isError: inner.isError,
        }),
      },
    ],
    isError: inner.isError,
  };
}

/**
 * A stand-in for muster's `call_tool` on the official MCP SDK's server: it
 * reports `steps` progress notifications under the caller's token, then
 * answers with its name. A call named `fail` answers a tool error; one named
 * `hang` never answers.
 */
class ProgressGateway {
  private server?: Server;
  url = '';
  tokens: unknown[] = [];
  authorizations: (string | undefined)[] = [];
  cancelled = false;

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      this.authorizations.push(req.headers.authorization);
      const mcp = new McpServer({ name: 'muster', version: 'test' });
      mcp.registerTool(
        'call_tool',
        {
          inputSchema: {
            name: z.string(),
            arguments: z.record(z.string(), z.unknown()).optional(),
          },
        },
        async ({ name, arguments: args }, extra) => {
          const token = extra._meta?.progressToken;
          this.tokens.push(token);
          const steps = Number(args?.steps ?? 0);
          for (let i = 1; token !== undefined && i <= steps; i++) {
            await extra.sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken: token,
                progress: i,
                message: `${i} of ${steps} PRs done`,
              },
            });
          }
          if (name === 'hang') {
            await new Promise<void>(resolve =>
              extra.signal.addEventListener('abort', () => {
                this.cancelled = true;
                resolve();
              }),
            );
          }
          if (name === 'fail') {
            return envelope({ text: 'no team file for "x"', isError: true });
          }
          return envelope({ text: JSON.stringify({ swept: name }) });
        },
      );
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on('close', () => {
        transport.close();
        mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    });
    await new Promise<void>(resolve =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    const { port } = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${port}/mcp`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise(resolve => this.server?.close(resolve));
  }
}

describe('MusterMcpClient.callToolWithProgress', () => {
  const logger = mockServices.logger.mock();
  let gateway: ProgressGateway;
  let client: MusterMcpClient;

  beforeEach(async () => {
    gateway = new ProgressGateway();
    await gateway.start();
    client = new MusterMcpClient({ name: 'gazelle', url: gateway.url }, logger);
  });

  afterEach(async () => {
    await client.dispose();
    await gateway.stop();
  });

  it("relays the tool's progress under a token of the call, then answers its result", async () => {
    const seen: MusterToolProgress[] = [];

    const result = await client.callToolWithProgress(
      'x_marge_sweep',
      { steps: 3 },
      { authToken: 'person-token', onProgress: p => seen.push(p) },
    );

    expect(result).toEqual({ swept: 'x_marge_sweep' });
    expect(seen.map(p => p.message)).toEqual([
      '1 of 3 PRs done',
      '2 of 3 PRs done',
      '3 of 3 PRs done',
    ]);
    expect(gateway.tokens).toHaveLength(1);
    expect(gateway.tokens[0]).toBeDefined();
    expect(gateway.authorizations).toContain('Bearer person-token');
  });

  it("throws the wrapped tool's error as a MusterToolError", async () => {
    await expect(
      client.callToolWithProgress('fail', {}, { onProgress: () => {} }),
    ).rejects.toEqual(new MusterToolError('no team file for "x"'));
  });

  it('cancels the call when the signal aborts', async () => {
    const controller = new AbortController();
    const call = client.callToolWithProgress(
      'hang',
      { steps: 1 },
      { onProgress: () => controller.abort(), signal: controller.signal },
    );

    await expect(call).rejects.toThrow();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(gateway.cancelled).toBe(true);
  });
});
