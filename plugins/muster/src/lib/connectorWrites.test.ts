import { connectorEditWrites, editTakesArgument } from './connectorWrites';

/** `core_mcpserver_connect` as muster declares it (connector_writes.go). */
const connect = {
  properties: {
    name: {},
    type: {},
    url: {},
    auth: {},
    headers: {},
    requestMeta: {},
    clientCredentials: {},
  },
};

describe('connectorEditWrites', () => {
  const edit = {
    name: 'jira',
    type: 'streamable-http',
    url: 'https://jira.example.com/mcp',
    auth: { type: 'oauth' },
    description: 'Tickets.',
    displayName: 'Jira',
    autoStart: true,
  };

  it('sends the connection to connect and the rest to update, connect first', () => {
    expect(connectorEditWrites(edit, connect)).toEqual([
      {
        tool: 'core_mcpserver_connect',
        args: {
          name: 'jira',
          type: 'streamable-http',
          url: 'https://jira.example.com/mcp',
          auth: { type: 'oauth' },
        },
      },
      {
        tool: 'core_mcpserver_update',
        args: {
          name: 'jira',
          description: 'Tickets.',
          displayName: 'Jira',
          autoStart: true,
        },
      },
    ]);
  });

  it('sends one update to a muster without connect', () => {
    expect(connectorEditWrites(edit, undefined)).toEqual([
      { tool: 'core_mcpserver_update', args: edit },
    ]);
  });

  it('leaves out a call with nothing to write, but always makes one', () => {
    expect(
      connectorEditWrites({ name: 'jira', url: 'https://x/mcp' }, connect),
    ).toEqual([
      {
        tool: 'core_mcpserver_connect',
        args: { name: 'jira', url: 'https://x/mcp' },
      },
    ]);
    expect(connectorEditWrites({ name: 'jira' }, connect)).toEqual([
      { tool: 'core_mcpserver_update', args: { name: 'jira' } },
    ]);
  });

  it('hands an argument neither declares to update, which refuses it in its own words', () => {
    expect(
      connectorEditWrites({ name: 'jira', approval: { rule: 'Ask' } }, connect),
    ).toEqual([
      {
        tool: 'core_mcpserver_update',
        args: { name: 'jira', approval: { rule: 'Ask' } },
      },
    ]);
  });
});

describe('editTakesArgument', () => {
  it('reads connect, or the update of a muster without it', () => {
    expect(
      editTakesArgument('clientCredentials', {
        update: { properties: { name: {} } },
        connect,
      }),
    ).toBe(true);
    expect(
      editTakesArgument('clientCredentials', {
        update: { properties: { clientCredentials: {} } },
        connect: null,
      }),
    ).toBe(true);
    expect(
      editTakesArgument('clientCredentials', {
        update: { properties: {} },
        connect: null,
      }),
    ).toBe(false);
    expect(
      editTakesArgument('clientCredentials', {
        update: { properties: {} },
        connect: undefined,
      }),
    ).toBeUndefined();
  });
});
