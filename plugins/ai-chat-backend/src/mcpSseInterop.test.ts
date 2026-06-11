import http from 'http';
import { AddressInfo } from 'net';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

/**
 * Regression test for the production AI chat hang (2026-06-11).
 *
 * MCP servers behind agentgateway answer streamable-HTTP POSTs with
 * `Content-Type: text/event-stream` bodies whose events carry no explicit
 * `event:` field — only `data:` lines. Per the SSE specification, an event
 * without an `event:` field defaults to the type "message", so a compliant
 * client must process it. @ai-sdk/mcp 1.0.x compared the parsed event type
 * strictly against the string "message" (`event === 'message'`), dropping
 * bare-data events and leaving the request promise pending forever, which
 * hung the whole chat request.
 *
 * This test runs the real @ai-sdk/mcp client against a minimal MCP server
 * that mimics agentgateway's SSE framing. It fails (times out) without the
 * @ai-sdk/mcp patch and passes with it.
 */
describe('MCP client interop with bare-data SSE responses (agentgateway framing)', () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.method === 'GET') {
        // No standalone inbound SSE stream; clients must tolerate this.
        res.writeHead(405).end();
        return;
      }
      if (req.method === 'DELETE') {
        res.writeHead(200).end();
        return;
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        const message = JSON.parse(body);

        // Notifications get an empty 202, like agentgateway/mcp-go.
        if (!('id' in message)) {
          res.writeHead(202).end();
          return;
        }

        let result: unknown;
        switch (message.method) {
          case 'initialize':
            result = {
              protocolVersion: message.params.protocolVersion,
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: 'fake-agentgateway', version: '0.0.1' },
            };
            break;
          case 'tools/list':
            result = {
              tools: [
                {
                  name: 'echo',
                  description: 'Echoes the input',
                  inputSchema: {
                    type: 'object',
                    properties: { text: { type: 'string' } },
                  },
                },
              ],
            };
            break;
          default:
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'mcp-session-id': 'test-session',
            });
            res.end(
              `data: ${JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                error: { code: -32601, message: 'Method not found' },
              })}\n\n`,
            );
            return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'mcp-session-id': 'test-session',
        });
        // Crucially: no `event: message` line, only `data:` — this is the
        // framing agentgateway produces.
        res.end(
          `data: ${JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result,
          })}\n\n`,
        );
      });
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const { address, port } = server.address() as AddressInfo;
    url = `http://${address}:${port}/mcp`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  });

  it('initializes and lists tools when SSE events have no explicit event field', async () => {
    const guard = (label: string) =>
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`${label} did not complete within 3s`)),
          3000,
        );
        timer.unref();
      });

    const client = await Promise.race([
      createMCPClient({
        name: 'bare-data-sse-server',
        transport: { type: 'http', url },
      }),
      guard('initialize'),
    ]);

    const tools = await Promise.race([client.tools(), guard('tools/list')]);

    expect(Object.keys(tools)).toContain('echo');

    await client.close();
  }, 10000);
});
