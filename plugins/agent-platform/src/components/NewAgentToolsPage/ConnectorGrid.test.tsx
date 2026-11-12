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

  it('shows a disconnected connector’s state instead of 0 tools', () => {
    render(
      <ConnectorGrid
        connectors={[{ ...bucket('jira'), state: 'Disconnected' }]}
        selected={new Set()}
        disabled={false}
        onChoose={jest.fn()}
      />,
    );

    const card = screen.getByLabelText('Connector jira');
    expect(card).toHaveTextContent('Disconnected: no tools listed');
    expect(card).not.toHaveTextContent('0 tools');
  });

  it('says a whole failed connector is chosen for once it connects', () => {
    render(
      <ConnectorGrid
        connectors={[{ ...bucket('jira'), state: 'Failed' }]}
        selected={new Set(['server:jira'])}
        disabled={false}
        onChoose={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Connector jira')).toHaveTextContent(
      'Failed: all, once connected',
    );
  });
});
