import { toMcpSignInRow } from './mcpSignInRow';

describe('toMcpSignInRow', () => {
  const openSignIn = jest.fn();

  it('has no row while nothing waits', () => {
    expect(
      toMcpSignInRow({
        installation: 'gazelle',
        waiting: [],
        seen: undefined,
        openSignIn,
      }),
    ).toBeUndefined();
  });

  // giantswarm/giantswarm#39050: connectors, by the names Customize lists
  // them by; a server muster did not name keeps its own.
  it('counts connectors and names them by their display names', () => {
    const row = toMcpSignInRow({
      installation: 'gazelle',
      waiting: [
        { name: 'agent-manager', label: 'Agent Manager' },
        { name: 'workspace-manager', label: 'workspace-manager' },
      ],
      seen: undefined,
      openSignIn,
    })!;

    expect(row.title).toBe('2 connectors need your sign-in');
    expect(row.context).toBe('Agent Manager, workspace-manager');
    expect(row.action).toEqual(
      expect.objectContaining({
        label: 'Sign in',
        accessibleLabel: 'Sign in to connectors',
      }),
    );
    expect(row.announce).toEqual(
      expect.objectContaining({
        title: '2 connectors need your sign-in',
        description: 'Agent Manager, workspace-manager',
      }),
    );
    // The identity stays the servers' names, whatever they are called.
    expect(row.id).toBe('mcp-sign-in:gazelle:agent-manager,workspace-manager');
  });

  it('says one connector in the singular', () => {
    const row = toMcpSignInRow({
      installation: 'gazelle',
      waiting: [{ name: 'agent-manager', label: 'Agent Manager' }],
      seen: undefined,
      openSignIn,
    })!;

    expect(row.title).toBe('1 connector needs your sign-in');
  });
});
