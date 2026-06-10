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
    });
  });

  it('rejects entries that require per-user auth', () => {
    const config = mockServices.rootConfig({
      data: {
        aiChat: {
          mcp: [
            {
              name: 'muster',
              url: 'http://muster/mcp',
              authProvider: 'gs',
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

  function buildClient(execute: jest.Mock) {
    const mcpClient = {
      toolsFromDefinitions: jest.fn(
        ({ tools }: { tools: { name: string }[] }) =>
          Object.fromEntries(tools.map(tool => [tool.name, { execute }])),
      ),
      close: jest.fn(),
    } as unknown as MCPClient;

    return new MusterMcpClient({ url: 'http://muster/mcp' }, logger, () =>
      Promise.resolve(mcpClient),
    );
  }

  it('parses JSON text content from tool results', async () => {
    const execute = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"workflows":[{"name":"wf-a"}]}' }],
      isError: false,
    });
    const client = buildClient(execute);

    const result = await client.callTool('core_workflow_list', {});

    expect(result).toEqual({ workflows: [{ name: 'wf-a' }] });
    expect(execute).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ toolCallId: expect.any(String) }),
    );
  });

  it('throws on tool-level errors', async () => {
    const execute = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'workflow not found' }],
      isError: true,
    });
    const client = buildClient(execute);

    await expect(
      client.callTool('core_workflow_get', { name: 'missing' }),
    ).rejects.toThrow('workflow not found');
  });

  it('returns raw text when the payload is not JSON', async () => {
    const execute = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'plain text' }],
    });
    const client = buildClient(execute);

    await expect(client.callTool('core_workflow_list', {})).resolves.toBe(
      'plain text',
    );
  });
});
