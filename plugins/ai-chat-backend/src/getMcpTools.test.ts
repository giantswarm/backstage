import { ConfigReader } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { McpClientCache } from '@giantswarm/backstage-plugin-gs-node';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { getMcpTools } from './getMcpTools';

jest.mock('@ai-sdk/mcp', () => ({
  experimental_createMCPClient: jest.fn(),
}));

const createMCPClientMock = createMCPClient as jest.Mock;

function mockLogger(): LoggerService {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as LoggerService;
}

function makeGoodClient() {
  return {
    listResources: jest
      .fn()
      .mockRejectedValue(new Error('does not support resources')),
    tools: jest.fn().mockResolvedValue({
      my_tool: {
        description: 'A test tool',
        execute: async () => 'ok',
      },
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

describe('getMcpTools', () => {
  let clientCache: McpClientCache;

  beforeEach(() => {
    jest.clearAllMocks();
    clientCache = new McpClientCache(mockLogger());
  });

  afterEach(async () => {
    // Don't await dispose: it may wait on never-resolving client promises
    // that the hanging-server tests intentionally leave behind.
    void clientCache.dispose().catch(() => {});
  });

  it('loads tools from a responsive MCP server', async () => {
    createMCPClientMock.mockImplementation(() =>
      Promise.resolve(makeGoodClient()),
    );

    const config = new ConfigReader({
      aiChat: {
        mcp: [{ name: 'good', url: 'http://good.example.com/mcp' }],
      },
    });

    const result = await getMcpTools(
      config,
      {},
      undefined,
      mockLogger(),
      clientCache,
    );

    expect(result.connectedServers).toEqual(['good']);
    expect(result.failedServers).toEqual([]);
    expect(Object.keys(result.tools)).toEqual(['my_tool']);
  });

  it('does not hang the chat request when an MCP server never completes the connection handshake', async () => {
    createMCPClientMock.mockImplementation(({ name }: { name: string }) => {
      if (name === 'hanging') {
        // Simulates a server whose initialize response is never delivered
        // to the client (observed in production with muster behind
        // agentgateway): the promise never settles.
        return new Promise(() => {});
      }
      return Promise.resolve(makeGoodClient());
    });

    const config = new ConfigReader({
      aiChat: {
        mcp: [
          { name: 'good', url: 'http://good.example.com/mcp' },
          {
            name: 'hanging',
            url: 'http://hanging.example.com/mcp',
            timeoutMs: 250,
          },
        ],
      },
    });

    const result = await getMcpTools(
      config,
      {},
      undefined,
      mockLogger(),
      clientCache,
    );

    expect(result.connectedServers).toEqual(['good']);
    expect(result.failedServers).toHaveLength(1);
    expect(result.failedServers[0].name).toBe('hanging');
    expect(result.failedServers[0].error).toMatch(/timed out/i);
    // Tools from the healthy server are still available.
    expect(Object.keys(result.tools)).toEqual(['my_tool']);
  }, 5000);

  it('does not hang the chat request when tools/list never returns', async () => {
    createMCPClientMock.mockImplementation(({ name }: { name: string }) => {
      if (name === 'hanging-tools') {
        return Promise.resolve({
          listResources: jest
            .fn()
            .mockRejectedValue(new Error('does not support resources')),
          // tools/list response never arrives
          tools: jest.fn().mockReturnValue(new Promise(() => {})),
          close: jest.fn().mockResolvedValue(undefined),
        });
      }
      return Promise.resolve(makeGoodClient());
    });

    const config = new ConfigReader({
      aiChat: {
        mcp: [
          {
            name: 'hanging-tools',
            url: 'http://hanging.example.com/mcp',
            timeoutMs: 250,
          },
          { name: 'good', url: 'http://good.example.com/mcp' },
        ],
      },
    });

    const result = await getMcpTools(
      config,
      {},
      undefined,
      mockLogger(),
      clientCache,
    );

    expect(result.connectedServers).toEqual(['good']);
    expect(result.failedServers).toHaveLength(1);
    expect(result.failedServers[0].name).toBe('hanging-tools');
    expect(result.failedServers[0].error).toMatch(/timed out/i);
    expect(Object.keys(result.tools)).toEqual(['my_tool']);
  }, 5000);

  it('evicts a timed-out server from the cache so the next request retries', async () => {
    let callCount = 0;
    createMCPClientMock.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise(() => {});
      }
      return Promise.resolve(makeGoodClient());
    });

    const config = new ConfigReader({
      aiChat: {
        mcp: [
          {
            name: 'flaky',
            url: 'http://flaky.example.com/mcp',
            timeoutMs: 250,
          },
        ],
      },
    });

    const first = await getMcpTools(
      config,
      {},
      undefined,
      mockLogger(),
      clientCache,
    );
    expect(first.failedServers).toHaveLength(1);

    const second = await getMcpTools(
      config,
      {},
      undefined,
      mockLogger(),
      clientCache,
    );
    expect(second.connectedServers).toEqual(['flaky']);
    expect(second.failedServers).toEqual([]);
  }, 5000);
});
