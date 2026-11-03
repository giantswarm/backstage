import { connectorToolEvent } from './connectorToolEvents';

describe('connectorToolEvent', () => {
  it.each([
    [
      'core_mcpserver_update',
      { name: 'Muster.mcpServerUpdated', attributes: {} },
    ],
    [
      'core_mcpserver_delete',
      { name: 'Muster.mcpServerDeleted', attributes: {} },
    ],
    [
      'core_service_start',
      {
        name: 'Muster.mcpServerConnectionChanged',
        attributes: { change: 'activated' },
      },
    ],
    [
      'core_service_stop',
      {
        name: 'Muster.mcpServerConnectionChanged',
        attributes: { change: 'deactivated' },
      },
    ],
    [
      'core_service_restart',
      {
        name: 'Muster.mcpServerConnectionChanged',
        attributes: { change: 'reconnected' },
      },
    ],
  ])("reports %s by what it did, never the server's name", (tool, event) => {
    expect(connectorToolEvent(tool, { name: 'miro' })).toEqual(event);
  });

  it.each([
    ['none', undefined],
    ['own-account', { type: 'oauth' }],
    ['platform-sso', { forwardToken: true }],
    ['sigv4', { type: 'sigv4' }],
  ])(
    'reports a registration with auth mode %s, as the wizard does',
    (authMode, auth) => {
      expect(
        connectorToolEvent('core_mcpserver_create', {
          name: 'miro',
          url: 'https://mcp.example.com/',
          ...(auth ? { auth } : {}),
        }),
      ).toEqual({ name: 'Muster.mcpServerAdded', attributes: { authMode } });
    },
  );

  it('has no event for a registration whose auth the wizard does not offer', () => {
    expect(
      connectorToolEvent('core_mcpserver_create', {
        name: 'remote',
        auth: { forwardToken: true, tokenExchange: { enabled: true } },
      }),
    ).toBeUndefined();
  });

  it.each(['core_echo', 'workflow_deploy', 'toString'])(
    'has no event for %s',
    tool => expect(connectorToolEvent(tool, {})).toBeUndefined(),
  );
});
