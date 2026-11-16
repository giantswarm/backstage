import {
  baseDataSet,
  inInstallation,
  setFixtureScenarioForTests,
  type ConnectorState,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { MCPServer } from '../../lib/k8s/MCPServer';
import { musterKubernetesObjectsOf } from '.';
import { CONNECT_MS, NEW_CONNECTOR_TOOLS } from './musterConnectorFixtureState';
import { musterFixtureApi } from './MusterFixtureApi';

const INSTALLATION = 'meadow';

describe('the connector writes in fixture mode', () => {
  const api = musterFixtureApi([]);
  const connectors = inInstallation(baseDataSet().connectors, INSTALLATION);
  const named = (state: ConnectorState) =>
    connectors.find(connector => connector.state === state)!.name;

  const call = (tool: string, args: Record<string, unknown>) =>
    api.callTool(tool, args, INSTALLATION);
  const stateOf = async (name: string) =>
    (await api.listServers(INSTALLATION)).mcpServers?.find(
      server => server.name === name,
    )?.state;
  const objectOf = (name: string) => {
    const object = musterKubernetesObjectsOf(INSTALLATION).find(
      o => o.kind === 'MCPServer' && o.metadata.name === name,
    );
    return object
      ? new MCPServer(object as MCPServer['jsonData'], INSTALLATION)
      : undefined;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    setFixtureScenarioForTests(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    setFixtureScenarioForTests(undefined);
  });

  it('registers a connector, which connects and then serves its tools', async () => {
    await expect(
      call('core_mcpserver_create', {
        name: 'orchard',
        displayName: 'Orchard',
        tags: ['team-a'],
        type: 'streamable-http',
        url: 'https://orchard.example.com/mcp',
        description: 'Reads the orchard.',
        autoStart: true,
      }),
    ).resolves.toBe("MCP server 'orchard' created successfully");

    expect(await stateOf('orchard')).toBe('Connecting');
    const object = objectOf('orchard')!;
    expect(object.getDisplayName()).toBe('Orchard');
    expect(object.getTags()).toEqual(['team-a']);
    expect(object.getUrl()).toBe('https://orchard.example.com/mcp');
    expect(object.getAutoStart()).toBe(true);
    await expect(api.listConnectorNames(INSTALLATION)).resolves.toEqual({
      servers: expect.arrayContaining([
        { name: 'orchard', displayName: 'Orchard' },
      ]),
    });

    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf('orchard')).toBe('Connected');
    expect(objectOf('orchard')?.getState()).toBe('Connected');
    const { tools, total } = await api.filterTools({
      installation: INSTALLATION,
      pattern: 'x_orchard_*',
    });
    expect(tools).toHaveLength(NEW_CONNECTOR_TOOLS);
    expect(total).toBe(NEW_CONNECTOR_TOOLS);
  });

  it('refuses a name taken, as muster does', async () => {
    await expect(
      call('core_mcpserver_create', {
        name: named('Connected'),
        type: 'streamable-http',
        url: 'https://taken.example.com/mcp',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: `MCP server '${named('Connected')}' already exists`,
        status: 422,
        kind: 'connector_refused',
      }),
    );
  });

  it('has a connector at a host no muster reaches fail once it tried', async () => {
    await call('core_mcpserver_create', {
      name: 'nowhere',
      type: 'streamable-http',
      url: 'https://nowhere.invalid/mcp',
      autoStart: true,
    });
    jest.advanceTimersByTime(CONNECT_MS);

    expect(await stateOf('nowhere')).toBe('Failed');
    const { servers } = await api.getAuthStatus(INSTALLATION);
    expect(servers.find(s => s.name === 'nowhere')?.status).toBe('failed');
  });

  it('has an OAuth connector wait for the person’s sign-in, and connect after it', async () => {
    await call('core_mcpserver_create', {
      name: 'grove',
      type: 'streamable-http',
      url: 'https://grove.example.com/mcp',
      auth: { type: 'oauth' },
      autoStart: true,
    });
    jest.advanceTimersByTime(CONNECT_MS);

    expect(await stateOf('grove')).toBe('Auth Required');
    await expect(
      call('core_service_restart', { name: 'grove' }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          "Service 'grove' requires OAuth authentication.",
        ),
      }),
    );

    await api.signInServer('grove', INSTALLATION);
    expect(await stateOf('grove')).toBe('Connecting');
    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf('grove')).toBe('Connected');

    await api.signOutServer('grove', INSTALLATION);
    expect(await stateOf('grove')).toBe('Auth Required');
  });

  it('edits a connector by muster’s merge rules, and connects it again', async () => {
    const name = named('Failed');
    const before = objectOf(name)!;

    await expect(
      call('core_mcpserver_update', {
        name,
        type: 'streamable-http',
        url: 'https://moved.example.com/mcp',
        description: '',
        displayName: 'Moved',
      }),
    ).resolves.toBe(`MCP server '${name}' updated successfully`);

    const after = objectOf(name)!;
    expect(after.getUrl()).toBe('https://moved.example.com/mcp');
    expect(after.getDescription()).toBe(before.getDescription());
    expect(after.getDisplayName()).toBe('Moved');
    expect(after.jsonData.metadata.generation).toBe(2);
    expect(after.isReconcilePending()).toBe(true);
    expect(await stateOf(name)).toBe('Connecting');
    // The new URL answers: it no longer fails.
    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf(name)).toBe('Connected');
    expect(objectOf(name)?.isReconcilePending()).toBe(false);
  });

  it('keeps a failing connector failing when reconnected', async () => {
    const name = named('Failed');

    await expect(call('core_service_restart', { name })).resolves.toBe(
      `Restart of service '${name}' requested; the reconciler will restart it`,
    );
    expect(await stateOf(name)).toBe('Connecting');
    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf(name)).toBe('Failed');
  });

  it('deactivates and activates a connector', async () => {
    const name = named('Connected');

    await call('core_service_stop', { name });
    expect(await stateOf(name)).toBe('Stopped');
    expect(objectOf(name)?.getSuspended()).toBe(true);
    await expect(call('core_service_restart', { name })).rejects.toEqual(
      expect.objectContaining({
        message: `Service '${name}' is suspended; use core_service_start to resume it`,
      }),
    );
    await expect(call('core_service_stop', { name })).resolves.toBe(
      `Service '${name}' is already suspended`,
    );

    await call('core_service_start', { name });
    expect(objectOf(name)?.getSuspended()).toBeFalsy();
    expect(await stateOf(name)).toBe('Connecting');
    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf(name)).toBe('Connected');
    await expect(call('core_service_start', { name })).resolves.toBe(
      `Service '${name}' is already running`,
    );
  });

  it('serves the data set’s stopped connector as deactivated', () => {
    expect(objectOf(named('Stopped'))?.getSuspended()).toBe(true);
  });

  it('deletes a connector', async () => {
    const name = named('Connected');
    const objects = musterKubernetesObjectsOf(INSTALLATION);

    await expect(call('core_mcpserver_delete', { name })).resolves.toBe(
      `MCP server '${name}' deleted successfully`,
    );

    expect(musterKubernetesObjectsOf(INSTALLATION)).not.toBe(objects);
    expect(objectOf(name)).toBeUndefined();
    expect(await stateOf(name)).toBeUndefined();
    await expect(call('core_mcpserver_delete', { name })).rejects.toEqual(
      expect.objectContaining({
        message: `Failed to delete MCP server: MCP server '${name}' not found`,
      }),
    );
  });

  it('answers the same objects while nothing changed', () => {
    expect(musterKubernetesObjectsOf(INSTALLATION)).toBe(
      musterKubernetesObjectsOf(INSTALLATION),
    );
  });

  it('forgets the writes when the scenario is set again, as on a reload', async () => {
    await call('core_mcpserver_delete', { name: named('Connected') });

    setFixtureScenarioForTests(undefined);

    expect(objectOf(named('Connected'))).toBeDefined();
  });

  it('fails the writes in the error scenario, as muster does', async () => {
    setFixtureScenarioForTests('error');
    const failing = musterFixtureApi([]);

    await expect(
      failing.callTool(
        'core_service_stop',
        { name: named('Connected') },
        INSTALLATION,
      ),
    ).rejects.toEqual(expect.objectContaining({ status: 401 }));
  });
});
