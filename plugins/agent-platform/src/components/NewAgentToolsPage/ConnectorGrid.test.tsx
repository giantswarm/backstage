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
