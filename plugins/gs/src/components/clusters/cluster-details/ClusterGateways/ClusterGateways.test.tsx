import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import { HttpRoute } from '../../../hooks/gatewayTopology';
import { ClusterGatewaysContent } from './ClusterGateways';

const parent = {
  kind: 'Gateway' as const,
  namespace: 'envoy-gateway-system',
  name: 'giantswarm-default',
  sectionName: 'https',
};

const healthy: HttpRoute = {
  id: 'team-a/healthy',
  namespace: 'team-a',
  name: 'healthy',
  hostnames: ['healthy.example.com'],
  parents: [
    {
      ...parent,
      accepted: { status: 'true', reason: 'Accepted' },
      resolvedRefs: { status: 'true', reason: 'ResolvedRefs' },
    },
  ],
};

const broken: HttpRoute = {
  id: 'team-z/broken',
  namespace: 'team-z',
  name: 'broken',
  hostnames: ['broken.example.com'],
  parents: [
    {
      ...parent,
      accepted: { status: 'true', reason: 'Accepted' },
      resolvedRefs: { status: 'false', reason: 'RefNotPermitted' },
    },
  ],
};

const unavailable: HttpRoute = {
  ...healthy,
  parents: [
    {
      ...parent,
      accepted: { status: 'not-available' },
      resolvedRefs: { status: 'not-available' },
    },
  ],
};

function render(routes: HttpRoute[]) {
  return renderInTestApp(
    <ClusterGatewaysContent
      clusterName="demo"
      gateways={[]}
      routes={routes}
      isLoading={false}
      policies={[]}
      policiesLoading={false}
      mimirAvailable
    />,
  );
}

describe('<ClusterGatewaysContent />', () => {
  it('lists broken routes first', async () => {
    await render([healthy, broken]);
    const rows = screen
      .getAllByRole('row')
      .filter(row => within(row).queryByText(/^(healthy|broken)$/));
    expect(within(rows[0]).getByText('broken')).toBeInTheDocument();
    expect(within(rows[0]).getByText('RefNotPermitted')).toBeInTheDocument();
  });

  it('shows a ListenerSet parent with its kind and conditions', async () => {
    await render([
      {
        ...healthy,
        id: 'team-b/slack-events',
        namespace: 'team-b',
        name: 'slack-events',
        parents: [
          {
            kind: 'ListenerSet',
            namespace: 'team-b',
            name: 'slack-events',
            sectionName: 'slack-events-https',
            accepted: { status: 'false', reason: 'NotAllowedByListeners' },
            resolvedRefs: { status: 'true', reason: 'ResolvedRefs' },
          },
        ],
      },
    ]);
    expect(
      screen.getByText('ListenerSet · team-b · slack-events-https'),
    ).toBeInTheDocument();
    expect(screen.getByText('NotAllowedByListeners')).toBeInTheDocument();
  });

  it('explains when route conditions are not available', async () => {
    await render([unavailable]);
    expect(
      screen.getByText(
        'Some route conditions are not available on this cluster.',
      ),
    ).toBeInTheDocument();
  });

  it('explains unavailable conditions even when another route is not reported', async () => {
    const unreported: HttpRoute = {
      ...healthy,
      id: 'team-c/admin',
      name: 'admin',
      parents: [
        {
          ...parent,
          accepted: { status: 'not-reported' },
          resolvedRefs: { status: 'not-reported' },
        },
      ],
    };
    await render([unavailable, unreported]);
    expect(
      screen.getByText(
        'Some route conditions are not available on this cluster.',
      ),
    ).toBeInTheDocument();
  });

  it('does not show the unavailable notice when conditions are reported', async () => {
    await render([healthy]);
    expect(
      screen.queryByText(
        'Some route conditions are not available on this cluster.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows a notice instead of tables without Mimir', async () => {
    await renderInTestApp(
      <ClusterGatewaysContent
        clusterName="demo"
        gateways={[]}
        routes={[]}
        isLoading={false}
        policies={[]}
        policiesLoading={false}
        mimirAvailable={false}
      />,
    );
    expect(
      screen.getByText(/not available on this installation/),
    ).toBeInTheDocument();
    expect(screen.queryByText('HTTPRoutes')).not.toBeInTheDocument();
  });
});
