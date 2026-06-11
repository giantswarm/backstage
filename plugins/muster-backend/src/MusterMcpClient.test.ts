import { mockServices } from '@backstage/backend-test-utils';
import type { MCPClient } from '@ai-sdk/mcp';
import { MusterMcpClient, readMusterServerFromConfig } from './MusterMcpClient';

describe('readMusterServerFromConfig', () => {
  const logger = mockServices.logger.mock();

  it('returns undefined without aiChat.mcp config', () => {
    const config = mockServices.rootConfig({ data: {} });
    expect(readMusterServerFromConfig(config, logger)).toBeUndefined();
  });

  it('selects the entry named muster by default', () => {
    const config = mockServices.rootConfig({
      data: {
        aiChat: {
          mcp: [
            { name: 'other', url: 'http://other/mcp' },
            {
              name: 'muster',
              url: 'http://muster:8090/mcp',
              headers: { 'X-Custom': 'value' },
            },
          ],
        },
      },
    });

    expect(readMusterServerFromConfig(config, logger)).toEqual({
      url: 'http://muster:8090/mcp',
      headers: { 'X-Custom': 'value' },
      authProvider: undefined,
    });
  });

  it('honors the muster.serverName override', () => {
    const config = mockServices.rootConfig({
      data: {
        muster: { serverName: 'muster-prod' },
        aiChat: {
          mcp: [{ name: 'muster-prod', url: 'http://muster-prod/mcp' }],
        },
      },
    });

    expect(readMusterServerFromConfig(config, logger)).toEqual({
      url: 'http://muster-prod/mcp',
      headers: undefined,
      authProvider: undefined,
    });
  });

  it('tolerates entries without a name', () => {
    const config = mockServices.rootConfig({
      data: {
        aiChat: {
          mcp: [
            { url: 'http://anonymous/mcp' },
            { name: 'muster', url: 'http://muster/mcp' },
          ],
        },
      },
    });

    expect(readMusterServerFromConfig(config, logger)).toEqual({
      url: 'http://muster/mcp',
      headers: undefined,
      authProvider: undefined,
    });
  });

  it('passes through the authProvider for per-user auth', () => {
    const config = mockServices.rootConfig({
      data: {
        aiChat: {
          mcp: [
            {
              name: 'muster',
              url: 'http://muster/mcp',
              authProvider: 'mcp-muster',
            },
          ],
        },
      },
    });

    expect(readMusterServerFromConfig(config, logger)).toEqual({
      url: 'http://muster/mcp',
      headers: undefined,
      authProvider: 'mcp-muster',
    });
  });

  it('rejects entries with useBackstageUserToken', () => {
    const config = mockServices.rootConfig({
      data: {
        aiChat: {
          mcp: [
            {
              name: 'muster',
              url: 'http://muster/mcp',
              useBackstageUserToken: true,
            },
          ],
        },
      },
    });

    expect(readMusterServerFromConfig(config, logger)).toBeUndefined();
  });
});

describe('MusterMcpClient', () => {
  const logger = mockServices.logger.mock();

  function buildMcpClient(execute: jest.Mock | undefined) {
    return {
      toolsFromDefinitions: jest.fn(
        ({ tools }: { tools: { name: string }[] }) =>
          Object.fromEntries(tools.map(tool => [tool.name, { execute }])),
      ),
      close: jest.fn(),
    } as unknown as MCPClient;
  }

  function buildClient(execute: jest.Mock | undefined) {
    const factory = jest.fn((_headers: Record<string, string> | undefined) =>
      Promise.resolve(buildMcpClient(execute)),
    );
    const client = new MusterMcpClient(
      { url: 'http://muster/mcp' },
      logger,
      factory,
    );
    return { client, factory };
  }

  /**
   * Wrap a target tool's MCP result the way muster's call_tool meta-tool
   * returns it: as a JSON string inside the meta-tool's text content block.
   */
  function callToolEnvelope(inner: {
    content: { type: string; text: string }[];
    isError?: boolean;
  }) {
    return {
      content: [{ type: 'text', text: JSON.stringify(inner) }],
      isError: false,
    };
  }

  it('invokes workflow tools through the call_tool meta-tool', async () => {
    const execute = jest.fn().mockResolvedValue(
      callToolEnvelope({
        content: [
          { type: 'text', text: '{"workflows":[{"name":"wf-a"}]}' },
        ],
        isError: false,
      }),
    );
    const { client } = buildClient(execute);

    const result = await client.callTool('core_workflow_list', {});

    expect(result).toEqual({ workflows: [{ name: 'wf-a' }] });
    expect(execute).toHaveBeenCalledWith(
      { name: 'core_workflow_list', arguments: {} },
      expect.objectContaining({ toolCallId: expect.any(String) }),
    );
  });

  it('forwards tool arguments inside the call_tool payload', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(
        callToolEnvelope({ content: [{ type: 'text', text: '{}' }] }),
      );
    const { client } = buildClient(execute);

    await client.callTool('core_workflow_execution_list', {
      workflow_name: 'wf-a',
      limit: 5,
    });

    expect(execute).toHaveBeenCalledWith(
      {
        name: 'core_workflow_execution_list',
        arguments: { workflow_name: 'wf-a', limit: 5 },
      },
      expect.anything(),
    );
  });

  it('throws on meta-tool errors', async () => {
    const execute = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: "tool 'core_workflow_get' not found" }],
      isError: true,
    });
    const { client } = buildClient(execute);

    await expect(
      client.callTool('core_workflow_get', { name: 'missing' }),
    ).rejects.toThrow("tool 'core_workflow_get' not found");
  });

  it('throws on target tool errors inside the envelope', async () => {
    const execute = jest.fn().mockResolvedValue(
      callToolEnvelope({
        content: [{ type: 'text', text: 'workflow not found' }],
        isError: true,
      }),
    );
    const { client } = buildClient(execute);

    await expect(
      client.callTool('core_workflow_get', { name: 'missing' }),
    ).rejects.toThrow('workflow not found');
  });

  it('returns raw text when the inner payload is not JSON', async () => {
    const execute = jest.fn().mockResolvedValue(
      callToolEnvelope({
        content: [{ type: 'text', text: 'plain text' }],
      }),
    );
    const { client } = buildClient(execute);

    await expect(client.callTool('core_workflow_list', {})).resolves.toBe(
      'plain text',
    );
  });

  it('supports servers that return the payload without an envelope', async () => {
    const execute = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"workflows":[{"name":"wf-a"}]}' }],
      isError: false,
    });
    const { client } = buildClient(execute);

    await expect(client.callTool('core_workflow_list', {})).resolves.toEqual({
      workflows: [{ name: 'wf-a' }],
    });
  });

  it('reports a clean error when call_tool has no executor', async () => {
    const { client } = buildClient(undefined);

    await expect(client.callTool('core_workflow_list', {})).rejects.toThrow(
      'has no executor',
    );
  });

  it('passes an Authorization header for per-user tokens', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(
        callToolEnvelope({ content: [{ type: 'text', text: '{}' }] }),
      );
    const { client, factory } = buildClient(execute);

    await client.callTool('core_workflow_list', {}, { authToken: 'token-a' });

    expect(factory).toHaveBeenCalledWith({ Authorization: 'Bearer token-a' });
  });

  it('caches clients per user token', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(
        callToolEnvelope({ content: [{ type: 'text', text: '{}' }] }),
      );
    const { client, factory } = buildClient(execute);

    await client.callTool('core_workflow_list', {}, { authToken: 'token-a' });
    await client.callTool('core_workflow_list', {}, { authToken: 'token-a' });
    await client.callTool('core_workflow_list', {}, { authToken: 'token-b' });

    expect(factory).toHaveBeenCalledTimes(2);
  });
});
