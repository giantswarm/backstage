import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SEARCH_MIN } from '@giantswarm/backstage-plugin-ui-react';

import type { ServerBucket } from '../../lib/toolset';
import { ConnectorGrid } from './ConnectorGrid';

function bucket(name: string, tags?: string[]): ServerBucket {
  return {
    name,
    isFamily: false,
    tools: [],
    needsSignIn: false,
    canSignIn: false,
    unknownServer: false,
    ...(tags ? { tags } : {}),
  };
}

describe('ConnectorGrid', () => {
  it('finds a connector by one of its tags', async () => {
    const connectors = [
      bucket('jira', ['ticketing']),
      ...Array.from({ length: SEARCH_MIN }, (_, i) => bucket(`app-${i}`)),
    ];
    render(
      <ConnectorGrid
        connectors={connectors}
        selected={new Set()}
        disabled={false}
        onChoose={jest.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText('Search connectors'), 'ticket');

    expect(screen.getByLabelText('Connector jira')).toBeInTheDocument();
    expect(screen.queryByLabelText('Connector app-0')).toBeNull();
  });

  it('says why Read-only cannot be picked when the read-only tools do not fit', () => {
    const tools: ServerBucket['tools'] = Array.from(
      { length: 129 },
      (_, i) => ({
        name: `x_wide_get_${i}`,
        summary: `Read ${i}`,
        server: 'wide',
        kind: 'tool' as const,
        annotations: { readOnlyHint: true },
      }),
    );
    render(
      <ConnectorGrid
        connectors={[{ ...bucket('wide'), tools, state: 'Connected' }]}
        maxSelectors={128}
        selected={new Set()}
        disabled={false}
        onChoose={jest.fn()}
      />,
    );

    const card = screen.getByRole('group', { name: 'Connector wide' });
    expect(card).toHaveTextContent('Connected');
    expect(card).toHaveTextContent(
      'Its read-only tools are more than the 128 an agent may list one by one, so choose All.',
    );
    expect(screen.getByRole('radio', { name: 'Read-only' })).toBeDisabled();
  });

  it('says a connector waiting on a sign-in has its tools listed after it', () => {
    render(
      <ConnectorGrid
        connectors={[{ ...bucket('pro'), needsSignIn: true, canSignIn: true }]}
        selected={new Set(['server:pro'])}
        disabled={false}
        onChoose={jest.fn()}
      />,
    );

    const card = screen.getByRole('group', { name: 'Connector pro' });
    expect(card).toHaveTextContent('Sign-in needed');
    expect(card).toHaveTextContent(
      'You can choose All now. Its tools show after you sign in.',
    );
    expect(card).toHaveTextContent(
      'Selected: all tools, including ones added later.',
    );
    const all = screen.getByRole('radio', { name: 'All' });
    expect(all).toBeChecked();
    expect(all.querySelector('svg')).not.toBeNull();
  });

  it('leaves byte validation of a read-only selection to the server', () => {
    render(
      <ConnectorGrid
        connectors={[
          {
            ...bucket('long'),
            state: 'Connected',
            tools: [
              {
                name: `x_${'é'.repeat(4094)}`,
                annotations: { readOnlyHint: true },
              },
            ],
          },
        ]}
        selected={new Set()}
        disabled={false}
        onChoose={jest.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Read-only' })).toBeEnabled();
  });

  it('explains that partial selection excludes tools added later', () => {
    const tools: ServerBucket['tools'] = ['read', 'write', 'delete'].map(
      name => ({
        name: `x_jira_${name}`,
        summary: name,
        server: 'jira',
        kind: 'tool',
      }),
    );
    render(
      <ConnectorGrid
        connectors={[{ ...bucket('jira'), tools, state: 'Connected' }]}
        selected={new Set(['tool:x_jira_read', 'tool:x_jira_write'])}
        disabled={false}
        onChoose={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('group', { name: 'Connector jira' }),
    ).toHaveTextContent(
      'Selected: 2 of 3 tools. Tools added later are not included.',
    );
  });

  function renderGrid(
    connectors: ServerBucket[],
    selected: string[] = [],
  ): void {
    render(
      <ConnectorGrid
        connectors={connectors}
        selected={new Set(selected)}
        disabled={false}
        onChoose={jest.fn()}
      />,
    );
  }

  it('shows a not-connected connector’s connection instead of 0 tools', () => {
    renderGrid([{ ...bucket('jira'), connection: 'not-connected' }]);

    const card = screen.getByLabelText('Connector jira');
    expect(card).toHaveTextContent('Not connected: no tools listed');
    expect(card).not.toHaveTextContent('0 tools');
  });

  it('says a whole connector is chosen for once it connects, or is activated', () => {
    renderGrid(
      [
        { ...bucket('jira'), connection: 'partial' },
        { ...bucket('wiki'), connection: 'deactivated' },
      ],
      ['server:jira', 'server:wiki'],
    );

    expect(screen.getByLabelText('Connector jira')).toHaveTextContent(
      'Partly connected: all, once connected',
    );
    expect(screen.getByLabelText('Connector wiki')).toHaveTextContent(
      'Deactivated: all, once activated',
    );
  });

  it('counts the tools chosen from it that it cannot list now', () => {
    renderGrid(
      [
        {
          ...bucket('jira'),
          connection: 'not-connected',
          toolNamePrefixes: ['x_jira'],
        },
      ],
      ['tool:x_jira_search', 'tool:x_wiki_get'],
    );

    expect(screen.getByLabelText('Connector jira')).toHaveTextContent(
      'Not connected: 1 chosen tool not listed',
    );
  });
});
