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
import type { Tool } from 'ai';
import { MusterMcpClient } from '@giantswarm/backstage-plugin-gs-node';
import {
  callMusterTool,
  musterInputRequired,
  withMusterCallTool,
} from './musterCalls';

const SIGN_IN_URL = 'https://muster.example/oauth/proxy/start?state=abc';
const REQUEST_STATE = 'opaque-state';

/**
 * muster's `call_tool` on the official SDK's 2026-07-28 server, as its
 * `urlElicitation` middleware answers: a call that declares URL elicitation
 * and carries no answer gets a sign-in page; an accepted retry runs the tool
 * once the sign-in is done (after `unfinishedAccepts` more asks); a declined
 * or cancelled one is muster's tool error.
 */
class MusterGateway {
  private server?: Server;
  url = '';
  unfinishedAccepts = 0;
  calls: Array<{ tool: unknown; requestState?: string; answer?: string }> = [];

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
        async (args, ctx) => {
          const capabilities = (
            ctx.mcpReq.envelope as
              Record<string, ClientCapabilities | undefined> | undefined
          )?.[CLIENT_CAPABILITIES_META_KEY];
          const answer = inputResponse(
            ctx.mcpReq.inputResponses,
            'muster_sign_in',
          );
          this.calls.push({
            tool: args.name,
            requestState: ctx.mcpReq.requestState(),
            answer: answer.kind === 'elicit' ? answer.action : undefined,
          });
          const signIn = () =>
            inputRequired({
              inputRequests: {
                muster_sign_in: inputRequired.elicitUrl({
                  message: 'Sign in to github to continue.',
                  url: SIGN_IN_URL,
                }),
              },
              requestState: REQUEST_STATE,
            });
          if (answer.kind === 'elicit' && answer.action !== 'accept') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `The tool did not run: the person answered ${answer.action} to signing in to github.`,
                },
              ],
              isError: true,
            };
          }
          if (answer.kind === 'elicit' && this.unfinishedAccepts > 0) {
            this.unfinishedAccepts--;
            return signIn();
          }
          if (answer.kind === 'missing' && capabilities?.elicitation?.url) {
            return signIn();
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  content: [{ type: 'text', text: 'octocat' }],
                }),
              },
            ],
          };
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

const signInElicitation = {
  key: 'muster_sign_in',
  url: SIGN_IN_URL,
  message: 'Sign in to github to continue.',
};

describe('muster calls of the AI chat', () => {
  const gateway = new MusterGateway();
  let client: MusterMcpClient;

  beforeAll(() => gateway.start());
  afterAll(() => gateway.stop());

  beforeEach(() => {
    gateway.calls = [];
    gateway.unfinishedAccepts = 0;
    client = new MusterMcpClient(
      { name: 'muster', url: gateway.url },
      mockServices.logger.mock(),
    );
  });

  afterEach(() => client.dispose());

  const call = { tool: 'x_github_get_me', arguments: { login: 'me' } };

  it('hands the sign-in to the page and runs the tool on the accepted retry', async () => {
    const first = await callMusterTool(client, call);

    expect(first).toMatchObject({
      isError: true,
      inputRequired: {
        tool: 'x_github_get_me',
        arguments: { login: 'me' },
        elicitations: [signInElicitation],
        requestState: REQUEST_STATE,
      },
    });
    expect(first.content[0].text).toMatch(/^The tool did not run: /);

    const retry = await callMusterTool(client, {
      ...call,
      input: {
        inputResponses: { muster_sign_in: { action: 'accept' } },
        requestState: first.inputRequired!.requestState,
      },
    });

    expect(retry).toEqual({ content: [{ type: 'text', text: 'octocat' }] });
    expect(gateway.calls).toEqual([
      { tool: 'x_github_get_me', requestState: undefined, answer: undefined },
      {
        tool: 'x_github_get_me',
        requestState: REQUEST_STATE,
        answer: 'accept',
      },
    ]);
  });

  it('hands the sign-in again when muster asks again after an accept', async () => {
    gateway.unfinishedAccepts = 1;
    const input = {
      inputResponses: { muster_sign_in: { action: 'accept' as const } },
      requestState: REQUEST_STATE,
    };

    await expect(
      callMusterTool(client, { ...call, input }),
    ).resolves.toMatchObject({
      inputRequired: { elicitations: [signInElicitation] },
    });
    await expect(callMusterTool(client, { ...call, input })).resolves.toEqual({
      content: [{ type: 'text', text: 'octocat' }],
    });
  });

  it.each(['decline', 'cancel'] as const)(
    "gives the model muster's words when the person answers %s",
    async action => {
      await expect(
        callMusterTool(client, {
          ...call,
          input: {
            inputResponses: { muster_sign_in: { action } },
            requestState: REQUEST_STATE,
          },
        }),
      ).resolves.toEqual({
        content: [
          {
            type: 'text',
            text: `The tool did not run: the person answered ${action} to signing in to github.`,
          },
        ],
        isError: true,
      });
    },
  );

  it("runs the listing's call_tool through muster with the person's token", async () => {
    const callTool = withMusterCallTool(
      { description: 'Call a tool', execute: jest.fn() } as unknown as Tool,
      client,
      'token',
    );

    const output = await callTool.execute!(
      { name: 'x_github_get_me', arguments: { login: 'me' } },
      { toolCallId: 'c1', messages: [], context: undefined } as never,
    );

    expect(output).toMatchObject({
      inputRequired: { tool: 'x_github_get_me', arguments: { login: 'me' } },
    });
    expect(callTool.description).toBe('Call a tool');
  });

  it('stops the turn after a step that asks the person to sign in', async () => {
    const step = (output: unknown) => ({ toolResults: [{ output }] }) as never;
    const asking = await callMusterTool(client, call);

    expect(musterInputRequired({ steps: [step(asking)] })).toBe(true);
    expect(
      musterInputRequired({
        steps: [step(asking), step({ content: [] })],
      }),
    ).toBe(false);
  });
});
