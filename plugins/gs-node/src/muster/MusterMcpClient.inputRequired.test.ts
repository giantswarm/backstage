import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { mockServices } from '@backstage/backend-test-utils';
import {
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
  createMcpHandler,
  inputRequired,
  inputResponse,
  McpServer,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { MusterInputRequiredError, MusterMcpClient } from './MusterMcpClient';

const SIGN_IN_URL = 'https://muster.example/oauth/proxy/start?state=abc';
const REQUEST_STATE = 'opaque-state';

/** muster's call_tool envelope around a wrapped tool's text answer. */
function envelope(text: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ content: [{ type: 'text', text }] }),
      },
    ],
  };
}

/**
 * A stand-in for muster's `call_tool` on the official SDK's 2026-07-28
 * server: a call that declares URL elicitation and carries no answer is
 * answered `input_required` with a sign-in page; its retry answers what the
 * person chose and the requestState it echoed.
 */
class ElicitingGateway {
  private server?: Server;
  url = '';
  declared: unknown[] = [];

  async start(): Promise<void> {
    const handler = createMcpHandler(() => {
      const mcp = new McpServer({ name: 'muster', version: 'test' });
      mcp.registerTool(
        'call_tool',
        {
          inputSchema: {
            name: z.string(),
            arguments: z.record(z.string(), z.unknown()).optional(),
          },
        },
        async (_args, ctx) => {
          // The SDK types the envelope as `{}`; it holds the wire keys.
          const capabilities = (
            ctx.mcpReq.envelope as
              Record<string, ClientCapabilities | undefined> | undefined
          )?.[CLIENT_CAPABILITIES_META_KEY];
          this.declared.push(capabilities?.elicitation);
          const answer = inputResponse(ctx.mcpReq.inputResponses, 'sign_in');
          if (answer.kind === 'missing' && capabilities?.elicitation?.url) {
            return inputRequired({
              inputRequests: {
                sign_in: inputRequired.elicitUrl({
                  message: 'Sign in to github to continue.',
                  url: SIGN_IN_URL,
                }),
              },
              requestState: REQUEST_STATE,
            });
          }
          return envelope(
            JSON.stringify({
              answer: answer.kind === 'elicit' ? answer.action : 'none',
              requestState: ctx.mcpReq.requestState(),
            }),
          );
        },
      );
      return mcp;
    });
    this.server = createServer((req, res) => {
      serve(handler.fetch, req, res).catch(() => res.destroy());
    });
    await new Promise<void>(resolve =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    const { port } = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${port}/mcp`;
  }

  async stop(): Promise<void> {
    await new Promise<void>(resolve => this.server?.close(() => resolve()));
  }
}

/** Serves one node request with a web-standard fetch handler. */
async function serve(
  fetchHandler: (request: Request) => Promise<Response>,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  const response = await fetchHandler(
    new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers,
      body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
    }),
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

describe('MusterMcpClient input_required on the official SDK', () => {
  const gateway = new ElicitingGateway();
  let client: MusterMcpClient;

  beforeAll(() => gateway.start());
  afterAll(() => gateway.stop());

  beforeEach(() => {
    gateway.declared = [];
    client = new MusterMcpClient(
      { name: 'gazelle', url: gateway.url },
      mockServices.logger.mock(),
    );
  });

  afterEach(() => client.dispose());

  it("hands muster's input_required back and sends the answer with the echoed requestState", async () => {
    const error = await client
      .callTool('x_github_get_me', {}, { urlElicitation: true })
      .catch(e => e);

    expect(error).toBeInstanceOf(MusterInputRequiredError);
    expect(error).toMatchObject({
      elicitations: [
        {
          key: 'sign_in',
          url: SIGN_IN_URL,
          message: 'Sign in to github to continue.',
        },
      ],
      requestState: REQUEST_STATE,
    });

    await expect(
      client.callTool(
        'x_github_get_me',
        {},
        {
          urlElicitation: true,
          input: {
            inputResponses: { sign_in: { action: 'accept' } },
            requestState: (error as MusterInputRequiredError).requestState,
          },
        },
      ),
    ).resolves.toEqual({ answer: 'accept', requestState: REQUEST_STATE });
    expect(gateway.declared).toEqual([{ url: {} }, { url: {} }]);
  });

  it('declares no elicitation on a progress call that does not ask for it', async () => {
    await expect(
      client.callToolWithProgress(
        'x_marge_sweep',
        {},
        { onProgress: () => {} },
      ),
    ).resolves.toEqual({ answer: 'none' });
    expect(gateway.declared).toEqual([undefined]);
  });
});
