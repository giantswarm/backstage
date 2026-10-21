import { mockServices } from '@backstage/backend-test-utils';
import type { MCPClient } from '@ai-sdk/mcp';
import { MusterAuthRequiredError, MusterMcpClient } from './MusterMcpClient';
import { REFUSED_SIGN_IN_HOLD_MS, SIGN_IN_REUSE_MS } from './pendingSignIns';

const LIST = 'x_workspace-manager_list_workspaces';
const AUTH_URL = 'https://muster/oauth/start?state=abc';
const CHALLENGE_TEXT =
  "auth_required: server 'workspace-manager' requires authentication before its tools can be called (this session is not authenticated to it).";

/** muster's call_tool envelope around a wrapped tool's result. */
function envelope(inner: {
  content: { type: string; text: string }[];
  isError?: boolean;
  structuredContent?: unknown;
}) {
  return {
    content: [{ type: 'text', text: JSON.stringify(inner) }],
    isError: inner.isError ?? false,
  };
}

/** muster's auth_required answer to a gated call; `null`: no sign-in link. */
function authRequired(authUrl: string | null = AUTH_URL) {
  return envelope({
    content: [
      { type: 'text', text: CHALLENGE_TEXT },
      {
        type: 'text',
        text: authUrl ? `Sign in: ${authUrl}` : 'Rate limit exceeded.',
      },
    ],
    isError: true,
    structuredContent: {
      status: 'auth_required',
      server: 'workspace-manager',
      ...(authUrl ? { authUrl } : {}),
    },
  });
}

const listed = envelope({
  content: [{ type: 'text', text: '{"workspaces":[]}' }],
});

describe('MusterMcpClient gated sign-ins', () => {
  const logger = mockServices.logger.mock();
  let now: number;

  function buildClient(execute: jest.Mock, readResource?: jest.Mock) {
    const mcp = {
      toolsFromDefinitions: jest.fn(
        ({ tools }: { tools: { name: string }[] }) =>
          Object.fromEntries(tools.map(tool => [tool.name, { execute }])),
      ),
      readResource,
      close: jest.fn(),
    } as unknown as MCPClient;
    return new MusterMcpClient(
      { name: 'muster', url: 'http://muster/mcp' },
      logger,
      () => Promise.resolve(mcp),
      undefined,
      () => now,
    );
  }

  /** The wrapped tool names muster was asked to run, in order. */
  function calledTools(execute: jest.Mock): string[] {
    return execute.mock.calls.map(([args]) => args.name);
  }

  beforeEach(() => {
    now = 1_000_000;
  });

  it("throws muster's auth_required answer as MusterAuthRequiredError, 401", async () => {
    const execute = jest.fn().mockResolvedValue(authRequired());
    const client = buildClient(execute);

    const error = await client
      .callTool(LIST, {}, { authToken: 'alice' })
      .catch(e => e);

    expect(error).toBeInstanceOf(MusterAuthRequiredError);
    expect(error).toMatchObject({
      name: 'MusterAuthRequiredError',
      status: 401,
      server: 'workspace-manager',
      authUrl: AUTH_URL,
      message: CHALLENGE_TEXT,
      details: [`Sign in: ${AUTH_URL}`],
    });
  });

  it('answers repeated gated calls from the pending sign-in without asking muster', async () => {
    const execute = jest.fn().mockResolvedValue(authRequired());
    const client = buildClient(execute);

    for (let poll = 0; poll < 20; poll++) {
      now += 5_000;
      await expect(
        client.callTool(LIST, {}, { authToken: 'alice' }),
      ).rejects.toMatchObject({
        server: 'workspace-manager',
        authUrl: AUTH_URL,
      });
    }

    // 100 s of polling: one sign-in started by muster, not twenty.
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("holds every tool of the server, through each of the client's call paths", async () => {
    const execute = jest.fn().mockResolvedValue(authRequired());
    const client = buildClient(execute);
    const alice = { authToken: 'alice' };

    await expect(client.callTool(LIST, {}, alice)).rejects.toThrow(
      MusterAuthRequiredError,
    );
    await expect(
      client.callToolContent('x_workspace-manager_get_workspace', {}, alice),
    ).rejects.toThrow(MusterAuthRequiredError);
    await expect(
      client.callToolWithStructured(
        'x_workspace-manager_list_providers',
        {},
        alice,
      ),
    ).rejects.toThrow(MusterAuthRequiredError);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('asks muster again once the sign-in link lapses', async () => {
    const execute = jest.fn().mockResolvedValue(authRequired());
    const client = buildClient(execute);

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();
    now += SIGN_IN_REUSE_MS;
    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('holds a refused sign-in (no link) for the rate-limit window only', async () => {
    const execute = jest.fn().mockResolvedValue(authRequired(null));
    const client = buildClient(execute);

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toMatchObject({ authUrl: undefined });
    now += REFUSED_SIGN_IN_HOLD_MS - 1;
    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);

    now += 1;
    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("keeps one person's pending sign-in from another's calls and other servers", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(authRequired())
      .mockResolvedValue(listed);
    const client = buildClient(execute);

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();
    await expect(
      client.callTool(LIST, {}, { authToken: 'bob' }),
    ).resolves.toEqual({ workspaces: [] });
    await expect(
      client.callTool('x_github_list_repos', {}, { authToken: 'alice' }),
    ).resolves.toEqual({ workspaces: [] });

    expect(calledTools(execute)).toEqual([LIST, LIST, 'x_github_list_repos']);
  });

  it('ends the wait when auth://status reads the server connected', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(authRequired())
      .mockResolvedValue(listed);
    const readResource = jest.fn().mockResolvedValue({
      contents: [
        {
          text: JSON.stringify({
            servers: [{ name: 'workspace-manager', status: 'connected' }],
          }),
        },
      ],
    });
    const client = buildClient(execute, readResource);

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();
    await client.getResource('auth://status', { authToken: 'alice' });

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).resolves.toEqual({ workspaces: [] });
  });

  it("ends the wait when the person's own core_auth_login connects", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(authRequired())
      .mockResolvedValueOnce(
        envelope({
          content: [{ type: 'text', text: 'Successfully connected' }],
        }),
      )
      .mockResolvedValue(listed);
    const client = buildClient(execute);

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();
    await client.callToolWithStructured(
      'core_auth_login',
      { server: 'workspace-manager' },
      { authToken: 'alice' },
    );

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).resolves.toEqual({ workspaces: [] });
  });

  it("carries the link of the person's own sign-in from then on", async () => {
    const restarted = 'https://muster/oauth/start?state=def';
    const execute = jest
      .fn()
      .mockResolvedValueOnce(authRequired())
      .mockResolvedValueOnce(
        envelope({
          content: [{ type: 'text', text: 'Authentication Required' }],
          structuredContent: { authUrl: restarted },
        }),
      );
    const client = buildClient(execute);

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();
    await client.callToolWithStructured(
      'core_auth_login',
      { server: 'workspace-manager' },
      { authToken: 'alice' },
    );

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toMatchObject({ authUrl: restarted });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('ends the wait on core_auth_logout', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(authRequired())
      .mockResolvedValueOnce(
        envelope({
          content: [
            {
              type: 'text',
              text: "Successfully logged out from 'workspace-manager'.",
            },
          ],
        }),
      )
      .mockResolvedValue(authRequired());
    const client = buildClient(execute);

    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();
    await client.callToolContent(
      'core_auth_logout',
      { server: 'workspace-manager' },
      { authToken: 'alice' },
    );
    await expect(
      client.callTool(LIST, {}, { authToken: 'alice' }),
    ).rejects.toThrow();

    expect(calledTools(execute)).toEqual([LIST, 'core_auth_logout', LIST]);
  });
});
