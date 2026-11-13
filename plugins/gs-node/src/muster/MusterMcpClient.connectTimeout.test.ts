import { mockServices } from '@backstage/backend-test-utils';
import { MusterMcpClient } from './MusterMcpClient';

const mockCreateMCPClient = jest.fn();
jest.mock('@ai-sdk/mcp', () => ({
  ...jest.requireActual('@ai-sdk/mcp'),
  experimental_createMCPClient: (config: unknown) =>
    mockCreateMCPClient(config),
}));

const mockTransportOptions = jest.fn();
jest.mock('@modelcontextprotocol/client', () => ({
  ...jest.requireActual('@modelcontextprotocol/client'),
  StreamableHTTPClientTransport: class {
    constructor(_url: URL, options: unknown) {
      mockTransportOptions(options);
    }
  },
  Client: class {
    connect() {
      return Promise.reject(new TypeError('fetch failed'));
    }
  },
}));

const INSTALLATION = { name: 'nowhere', url: 'https://muster.example/mcp' };

describe('MusterMcpClient connections', () => {
  // The timeout itself is pinned in musterFetch.test.ts.
  it('opens its MCP sessions with the fetch that bounds the connection', async () => {
    mockCreateMCPClient.mockRejectedValue(new TypeError('fetch failed'));
    const client = new MusterMcpClient(
      INSTALLATION,
      mockServices.logger.mock(),
    );

    await expect(
      client.callTool('core_mcpserver_list', {}, { authToken: 't' }),
    ).rejects.toThrow('nowhere did not answer');

    const { transport } = mockCreateMCPClient.mock.calls[0][0];
    expect(transport).toMatchObject({ type: 'http', url: INSTALLATION.url });
    expect(transport.fetch).toEqual(expect.any(Function));
    expect(transport.fetch).not.toBe(globalThis.fetch);
  });

  it('opens a call with progress with the same fetch', async () => {
    mockCreateMCPClient.mockRejectedValue(new TypeError('fetch failed'));
    const client = new MusterMcpClient(
      INSTALLATION,
      mockServices.logger.mock(),
    );

    await expect(
      client.callToolWithProgress(
        'x_tool',
        {},
        { authToken: 't', onProgress: () => {} },
      ),
    ).rejects.toThrow();

    const options = mockTransportOptions.mock.calls[0][0];
    expect(options.fetch).toEqual(expect.any(Function));
    expect(options.fetch).not.toBe(globalThis.fetch);
  });
});
