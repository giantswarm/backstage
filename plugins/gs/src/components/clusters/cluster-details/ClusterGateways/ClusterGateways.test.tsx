import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Gateway, HttpRoute } from '../../../utils/gatewayTopology';
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
      accepted: { status: 'not-available', cause: 'not-exported' },
      resolvedRefs: { status: 'not-available', cause: 'not-exported' },
    },
  ],
};

function render(routes: HttpRoute[], gateways: Gateway[] = []) {
  return renderInTestApp(
    <ClusterGatewaysContent
      clusterName="demo"
      gateways={gateways}
      routes={routes}
      isLoading={false}
      policies={[]}
      policiesLoading={false}
      mimirAvailable
    />,
  );
}

describe('<ClusterGatewaysContent />', () => {
  it('shows one row per Gateway with its listeners inside', async () => {
    await render(
      [],
      [
        {
          id: 'envoy-gateway-system/giantswarm-default',
          namespace: 'envoy-gateway-system',
          name: 'giantswarm-default',
          className: 'giantswarm-default',
          accepted: { status: 'true' },
          programmed: { status: 'true' },
          listeners: [
            {
              name: 'http',
              protocol: 'HTTP',
              port: '80',
              attachedRoutes: 1,
            },
            {
              name: 'https',
              protocol: 'HTTPS',
              port: '443',
              hostname: '*.example.com',
              attachedRoutes: 4,
            },
          ],
        },
      ],
    );
    const rows = screen
      .getAllByRole('row')
      .filter(row => within(row).queryByText('giantswarm-default'));
    expect(rows).toHaveLength(1);
    expect(
      within(rows[0]).getByText('http · HTTP/80 · any · 1 route'),
    ).toBeInTheDocument();
    expect(
      within(rows[0]).getByText('https · HTTPS/443 · *.example.com · 4 routes'),
    ).toBeInTheDocument();
  });

  it('links concrete hostnames and leaves wildcards as text', async () => {
    await render([
      { ...healthy, hostnames: ['healthy.example.com', '*.example.com'] },
    ]);
    expect(
      screen.getByRole('link', { name: 'healthy.example.com' }),
    ).toHaveAttribute('href', 'https://healthy.example.com/');
    expect(
      screen.queryByRole('link', { name: '*.example.com' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('*.example.com')).toBeInTheDocument();
  });

  it('filters routes by search', async () => {
    await render([healthy, broken]);
    fireEvent.change(screen.getByLabelText('Search HTTPRoutes'), {
      target: { value: 'broken.example' },
    });
    await waitFor(() =>
      expect(screen.queryByText('healthy')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('broken')).toBeInTheDocument();
  });

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

  it('lists routes without status right after the broken ones', async () => {
    const unreported: HttpRoute = {
      ...healthy,
      id: 'team-c/admin',
      namespace: 'team-c',
      name: 'admin',
      parents: [
        {
          ...parent,
          accepted: { status: 'not-reported' },
          resolvedRefs: { status: 'not-reported' },
        },
      ],
    };
    await render([healthy, unreported, broken]);
    const names = screen
      .getAllByRole('row')
      .map(row => within(row).queryByText(/^(healthy|broken|admin)$/))
      .filter(Boolean)
      .map(cell => cell!.textContent);
    expect(names).toEqual(['broken', 'admin', 'healthy']);
  });

  it('says a failed load will be retried, not that the bundle is too old', async () => {
    await render([
      {
        ...healthy,
        parents: [
          {
            ...parent,
            accepted: { status: 'not-available', cause: 'load-failed' },
            resolvedRefs: { status: 'not-available', cause: 'not-exported' },
          },
        ],
      },
    ]);
    expect(
      screen.getByText(
        'Some route conditions could not be loaded. They are retried automatically.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/observability-bundle/)).not.toBeInTheDocument();
  });

  it('explains when route conditions are not available', async () => {
    await render([unavailable]);
    expect(
      screen.getByText(
        'Route conditions need observability-bundle 3.6.0 or newer on this cluster.',
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
        'Route conditions need observability-bundle 3.6.0 or newer on this cluster.',
      ),
    ).toBeInTheDocument();
  });

  it('does not show the unavailable notice when conditions are reported', async () => {
    await render([healthy]);
    expect(
      screen.queryByText(/Route conditions need|could not be loaded/),
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
