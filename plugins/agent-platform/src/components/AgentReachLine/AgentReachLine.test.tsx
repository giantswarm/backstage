import { render, screen } from '@testing-library/react';
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import { buildCatalogue, type CatalogueGroup } from '../../lib/toolset';
import { AgentReachLine } from './AgentReachLine';

let mockGroups: CatalogueGroup[] | undefined;
const mockUseReachCatalogue = jest.fn(
  (_installation: string | undefined, _needed: boolean) => mockGroups,
);
jest.mock('../../hooks/useReachCatalogue', () => ({
  useReachCatalogue: (installation: string | undefined, needed: boolean) =>
    mockUseReachCatalogue(installation, needed),
}));

const reads = (name: string): ToolSummary => ({
  name,
  kind: 'tool',
  annotations: { readOnlyHint: true },
});

const GROUPS = buildCatalogue(
  [
    reads('x_cluster-manager_get_info'),
    reads('x_cluster-manager_list_clusters'),
    { name: 'x_cluster-manager_delete_cluster', kind: 'tool' },
    { name: 'core_auth_login', kind: 'core' },
    { name: 'core_service_list', kind: 'core' },
  ],
  [
    {
      name: 'cluster-manager',
      group: 'infrastructure',
      toolNamePrefix: 'x_cluster-manager',
      oauth: false,
    },
  ],
  [],
);

// The PO's example: two tools of cluster manager and one of muster's own.
const PICKED = {
  state: 'declared' as const,
  carrier: 'sre-agent',
  selectors: [
    'tool:x_cluster-manager_get_info',
    'tool:x_cluster-manager_delete_cluster',
    'tool:core_auth_login',
  ],
};

beforeEach(() => {
  mockGroups = GROUPS;
  mockUseReachCatalogue.mockClear();
});

describe('AgentReachLine', () => {
  it('names connectors instead of tool ids, and links to the agent’s tools', () => {
    render(
      <AgentReachLine
        toolset={PICKED}
        installation="gazelle"
        toolsHref="/agent-platform/agents/gazelle/kagent/sre-agent/tools"
      />,
    );

    expect(mockUseReachCatalogue).toHaveBeenCalledWith('gazelle', true);
    expect(
      screen.getByText(
        'Can use some tools from cluster-manager and some platform tools.',
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/x_cluster-manager/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'See which tools' }),
    ).toHaveAttribute(
      'href',
      '/agent-platform/agents/gazelle/kagent/sre-agent/tools',
    );
  });

  it('counts the picked tools while the catalogue is not known', () => {
    mockGroups = undefined;
    render(<AgentReachLine toolset={PICKED} installation="gazelle" />);

    expect(screen.getByText('Can use 3 selected tools.')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'See which tools' }),
    ).not.toBeInTheDocument();
  });

  it('does not read the catalogue for whole connectors', () => {
    render(
      <AgentReachLine
        toolset={{
          state: 'declared',
          carrier: 'sre-agent',
          selectors: ['server:github'],
        }}
        installation="gazelle"
      />,
    );

    expect(mockUseReachCatalogue).toHaveBeenCalledWith('gazelle', false);
    expect(screen.getByText('Can use github.')).toBeInTheDocument();
  });

  it('offers no tools link for an agent without connectors', () => {
    render(
      <AgentReachLine
        toolset={{ state: 'no-gateway' }}
        toolsHref="/agent-platform/agents/gazelle/kagent/chat/tools"
      />,
    );

    expect(screen.getByText('Has no connectors.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing for an unknown toolset', () => {
    const { container } = render(<AgentReachLine />);

    expect(container).toBeEmptyDOMElement();
  });
});
