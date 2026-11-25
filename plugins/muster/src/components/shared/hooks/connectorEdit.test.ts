import { QueryClient } from '@tanstack/react-query';
import {
  baseDataSet,
  inInstallation,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type { MusterApi } from '../../../apis';
import { musterKubernetesObjectsOf } from '../../../apis/fixtures';
import { musterFixtureApi } from '../../../apis/fixtures/MusterFixtureApi';
import { toMcpServerDefinition } from '../../../lib/gitops';
import { MCPServer } from '../../../lib/k8s/MCPServer';
import { writeConnectorEdit } from './connectorEdit';

const INSTALLATION = 'meadow';

function storedConnector(): MCPServer {
  const connector = inInstallation(baseDataSet().connectors, INSTALLATION).find(
    c => c.state === 'Connected',
  )!;
  const object = musterKubernetesObjectsOf(INSTALLATION).find(
    o => o.kind === 'MCPServer' && o.metadata.name === connector.name,
  )!;
  return new MCPServer(object as MCPServer['jsonData'], INSTALLATION);
}

describe('writeConnectorEdit', () => {
  const queryClient = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false } } });

  it("saves the JSON edit of a stored connector through muster's split writes", async () => {
    const api = musterFixtureApi([]);
    const edited = {
      ...toMcpServerDefinition(storedConnector()),
      url: 'https://json.example.com/mcp',
      description: 'Edited as JSON.',
    };

    await writeConnectorEdit(queryClient(), api, edited, INSTALLATION);

    expect(storedConnector().getUrl()).toBe('https://json.example.com/mcp');
    expect(storedConnector().getDescription()).toBe('Edited as JSON.');
  });

  it('says which part was saved when the second write fails', async () => {
    const callTool = jest.fn((tool: string) =>
      tool === 'core_mcpserver_update'
        ? Promise.reject(new Error('Permission denied: your user may not'))
        : Promise.resolve({}),
    );
    const api = {
      callTool,
      describeTool: (name: string) =>
        Promise.resolve({
          name,
          inputSchema: { properties: { name: {}, url: {} } },
        }),
    } as unknown as MusterApi;

    await expect(
      writeConnectorEdit(
        queryClient(),
        api,
        { name: 'jira', url: 'https://x/mcp', description: 'D' },
        INSTALLATION,
      ),
    ).rejects.toThrow(
      'The connection settings were saved, but the rest of the edit (description) was not: Permission denied: your user may not',
    );
    expect(callTool.mock.calls.map(([tool]) => tool)).toEqual([
      'core_mcpserver_connect',
      'core_mcpserver_update',
    ]);
  });
});
