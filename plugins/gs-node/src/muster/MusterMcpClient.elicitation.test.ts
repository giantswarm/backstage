import { mockServices } from '@backstage/backend-test-utils';
import type { MCPClient } from '@ai-sdk/mcp';
import { CLIENT_CAPABILITIES_META_KEY } from '@modelcontextprotocol/client';
import {
  MusterAuthRequiredError,
  MusterInputRequiredError,
  MusterMcpClient,
  MusterToolError,
  type ToolCallClient,
} from './MusterMcpClient';

const TOOL = 'x_lab-oauth-fixture_list_core_tools';
const SIGN_IN_URL = 'https://muster/oauth/proxy/start?state=abc';
const REQUEST_STATE = '{"server":"lab-oauth-fixture","link":"x"}';

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

const answered = envelope({ content: [{ type: 'text', text: '{"ok":true}' }] });

/** muster's input_required answer asking the person to sign in. */
const signInRequired = {
  resultType: 'input_required',
  inputRequests: {
    muster_sign_in: {
      method: 'elicitation/create',
      params: {
        mode: 'url',
        message: 'Sign in to lab-oauth-fixture to continue.',
        url: SIGN_IN_URL,
        elicitationId: 'e1',
      },
    },
  },
  requestState: REQUEST_STATE,
};

/** muster's auth_required answer of a call that declared no elicitation. */
const authRequired = envelope({
  content: [{ type: 'text', text: 'auth_required' }],
  isError: true,
  structuredContent: {
    status: 'auth_required',
    server: 'lab-oauth-fixture',
    authUrl: SIGN_IN_URL,
  },
});

describe('MusterMcpClient URL elicitation', () => {
  const logger = mockServices.logger.mock();

  function buildClient(callTool: jest.Mock, execute = jest.fn()) {
    const mcp = {
      toolsFromDefinitions: jest.fn(
        ({ tools }: { tools: { name: string }[] }) =>
          Object.fromEntries(tools.map(tool => [tool.name, { execute }])),
      ),
      close: jest.fn(),
    } as unknown as MCPClient;
    const toolCallFactory = jest.fn(async (): Promise<ToolCallClient> => ({
      callTool,
      close: jest.fn().mockResolvedValue(undefined),
    }));
    const client = new MusterMcpClient(
      { name: 'gazelle', url: 'http://muster/mcp' },
      logger,
      () => Promise.resolve(mcp),
      toolCallFactory,
    );
    return { client, toolCallFactory, execute };
  }

  it('declares URL elicitation on the call and answers its result', async () => {
    const callTool = jest.fn().mockResolvedValue(answered);
    const { client } = buildClient(callTool);

    await expect(
      client.callTool(TOOL, { a: 1 }, { authToken: 't', urlElicitation: true }),
    ).resolves.toEqual({ ok: true });

    const [params, options] = callTool.mock.calls[0];
    expect(params).toEqual({
      name: 'call_tool',
      arguments: { name: TOOL, arguments: { a: 1 } },
      _meta: {
        [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { url: {} } },
      },
    });
    expect(options).toMatchObject({ allowInputRequired: true });
  });

  it("throws muster's input_required as the elicitations and requestState for the page", async () => {
    const callTool = jest.fn().mockResolvedValue(signInRequired);
    const { client } = buildClient(callTool);

    const error = await client
      .callTool(TOOL, {}, { authToken: 't', urlElicitation: true })
      .catch(e => e);

    expect(error).toBeInstanceOf(MusterInputRequiredError);
    expect(error).toMatchObject({
      status: 428,
      tool: TOOL,
      server: 'lab-oauth-fixture',
      installation: 'gazelle',
      message: 'Sign in to lab-oauth-fixture to continue.',
      elicitations: [
        {
          key: 'muster_sign_in',
          url: SIGN_IN_URL,
          message: 'Sign in to lab-oauth-fixture to continue.',
          elicitationId: 'e1',
        },
      ],
      requestState: REQUEST_STATE,
    });
  });

  it("sends the person's answers and muster's requestState unchanged on the retry", async () => {
    const callTool = jest.fn().mockResolvedValue(answered);
    const { client } = buildClient(callTool);

    await client.callTool(
      TOOL,
      {},
      {
        authToken: 't',
        urlElicitation: true,
        input: {
          inputResponses: { muster_sign_in: { action: 'accept' } },
          requestState: REQUEST_STATE,
        },
      },
    );

    expect(callTool.mock.calls[0][0]).toMatchObject({
      inputResponses: { muster_sign_in: { action: 'accept' } },
      requestState: REQUEST_STATE,
    });
  });

  it('sends the retry to muster while an earlier call holds a pending sign-in', async () => {
    const execute = jest.fn().mockResolvedValue(authRequired);
    const callTool = jest.fn().mockResolvedValue(answered);
    const { client } = buildClient(callTool, execute);

    await expect(
      client.callTool(TOOL, {}, { authToken: 't' }),
    ).rejects.toBeInstanceOf(MusterAuthRequiredError);
    await expect(
      client.callTool(
        TOOL,
        {},
        {
          authToken: 't',
          urlElicitation: true,
          input: { inputResponses: { muster_sign_in: { action: 'accept' } } },
        },
      ),
    ).resolves.toEqual({ ok: true });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('fails a call asked for input other than a URL elicitation', async () => {
    const callTool = jest.fn().mockResolvedValue({
      resultType: 'input_required',
      inputRequests: {
        name: {
          method: 'elicitation/create',
          params: {
            mode: 'form',
            message: 'Your name?',
            requestedSchema: { type: 'object', properties: {} },
          },
        },
      },
    });
    const { client } = buildClient(callTool);

    const error = await client
      .callTool(TOOL, {}, { authToken: 't', urlElicitation: true })
      .catch(e => e);

    expect(error).toBeInstanceOf(MusterToolError);
    expect(error).not.toBeInstanceOf(MusterInputRequiredError);
    expect((error as Error).message).toBe(
      `${TOOL} asked for input the portal cannot give.`,
    );
  });

  it('keeps a call that declares nothing on the cached @ai-sdk/mcp client', async () => {
    const execute = jest.fn().mockResolvedValue(answered);
    const callTool = jest.fn();
    const { client, toolCallFactory } = buildClient(callTool, execute);

    await expect(
      client.callTool(TOOL, {}, { authToken: 't' }),
    ).resolves.toEqual({ ok: true });
    expect(toolCallFactory).not.toHaveBeenCalled();
  });

  it('reuses one official SDK client per caller', async () => {
    const callTool = jest.fn().mockResolvedValue(answered);
    const { client, toolCallFactory } = buildClient(callTool);

    await client.callTool(TOOL, {}, { authToken: 't', urlElicitation: true });
    await client.callTool(TOOL, {}, { authToken: 't', urlElicitation: true });

    expect(toolCallFactory).toHaveBeenCalledTimes(1);
    await client.dispose();
  });
});
