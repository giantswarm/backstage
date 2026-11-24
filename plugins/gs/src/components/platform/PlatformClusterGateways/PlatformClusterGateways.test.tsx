import { useState } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  mockContainerWidth,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import type { GatewayPolicy } from '../../utils/gatewayPolicies';
import type { ReferenceGrant } from '../../utils/gatewayReferenceGrants';
import type { Gateway, HttpRoute } from '../../utils/gatewayTopology';
import { PlatformClusterGatewaysContent } from './PlatformClusterGateways';

const TRUE = { status: 'true' as const };

const main: Gateway = {
  id: 'envoy-gateway-system/giantswarm-default',
  namespace: 'envoy-gateway-system',
  name: 'giantswarm-default',
  className: 'giantswarm-default',
  accepted: TRUE,
  programmed: TRUE,
  listeners: [
    {
      name: 'https',
      protocol: 'HTTPS',
      port: '443',
      hostname: '*.example.com',
      attachedRoutes: 1,
    },
  ],
};

const internal: Gateway = {
  ...main,
  id: 'payments/payments-internal',
  namespace: 'payments',
  name: 'payments-internal',
  className: 'envoy-internal',
  listeners: [{ name: 'internal-https', protocol: 'HTTPS', port: '443' }],
};

function onGateway(gateway: Gateway, sectionName: string) {
  return {
    kind: 'Gateway' as const,
    namespace: gateway.namespace,
    name: gateway.name,
    sectionName,
    accepted: TRUE,
    resolvedRefs: TRUE,
  };
}

const storefront: HttpRoute = {
  id: 'shop/storefront',
  namespace: 'shop',
  name: 'storefront',
  hostnames: ['shop.example.com'],
  backends: {
    status: 'available',
    backends: [
      { kind: 'Service', namespace: 'shop', name: 'storefront', port: '80' },
      { kind: 'Service', namespace: 'catalog', name: 'catalog', port: '80' },
    ],
    mayHaveMore: false,
  },
  parents: [onGateway(main, 'https')],
};

const ledger: HttpRoute = {
  id: 'payments/ledger-api',
  namespace: 'payments',
  name: 'ledger-api',
  hostnames: ['ledger.internal.example.com'],
  backends: {
    status: 'available',
    backends: [
      {
        kind: 'Service',
        namespace: 'payments',
        name: 'ledger-api',
        port: '9090',
      },
    ],
    mayHaveMore: false,
  },
  parents: [
    {
      ...onGateway(internal, 'internal-https'),
      accepted: { status: 'false', reason: 'NoMatchingListenerHostname' },
    },
  ],
};

const webhooks: HttpRoute = {
  ...storefront,
  id: 'events/event-webhooks',
  namespace: 'events',
  name: 'event-webhooks',
  hostnames: ['events.example.com'],
  parents: [
    {
      ...onGateway(main, 'https'),
      kind: 'ListenerSet',
      namespace: 'events',
      name: 'events-https',
    },
  ],
};

const ipAllow: GatewayPolicy = {
  id: 'payments/ip-allow',
  kind: 'SecurityPolicy',
  namespace: 'payments',
  name: 'payments-internal-ip-allow',
  targets: [
    { kind: 'Gateway', name: 'payments-internal', source: 'targetRefs' },
  ],
  targetsLoaded: true,
  ancestors: [
    {
      id: 'a',
      kind: 'Gateway',
      namespace: 'payments',
      name: 'payments-internal',
      accepted: TRUE,
    },
  ],
  status: { status: 'not-reported' },
};

const GATEWAY_API = 'gateway.networking.k8s.io';

/** One grant per place: a route's, a Gateway's, and one nothing uses. */
const grants: ReferenceGrant[] = [
  {
    id: 'catalog/from-shop',
    namespace: 'catalog',
    name: 'from-shop',
    from: [{ group: GATEWAY_API, kind: 'HTTPRoute', namespace: 'shop' }],
    to: [{ group: '', kind: 'Service', name: 'catalog' }],
  },
  {
    id: 'certs/payments-gateways',
    namespace: 'certs',
    name: 'payments-gateways',
    from: [{ group: GATEWAY_API, kind: 'Gateway', namespace: 'payments' }],
    to: [{ group: '', kind: 'Secret' }],
  },
  {
    id: 'legacy/from-old',
    namespace: 'legacy',
    name: 'from-old',
    from: [{ group: GATEWAY_API, kind: 'HTTPRoute', namespace: 'old' }],
    to: [{ group: '', kind: 'Service' }],
  },
];

/** The content with its selection in state, as `?gateway=` keeps it. */
function Harness({
  error,
  policiesError,
  referenceGrantsError,
  initial,
}: {
  error?: Error;
  policiesError?: Error;
  referenceGrantsError?: Error;
  initial?: string;
}) {
  const [selected, setSelected] = useState<string | undefined>(initial);
  return (
    <>
      <output data-testid="selected">{selected ?? ''}</output>
      <PlatformClusterGatewaysContent
        clusterName="demo"
        gateways={[main, internal]}
        routes={[storefront, ledger, webhooks]}
        isLoading={false}
        error={error}
        policies={[ipAllow]}
        policiesLoading={false}
        policiesError={policiesError}
        referenceGrants={grants}
        referenceGrantsLoading={false}
        referenceGrantsError={referenceGrantsError}
        selected={selected}
        onSelect={setSelected}
      />
    </>
  );
}

function gatewayButton(name: string) {
  return screen.getByRole('button', { name });
}

describe('<PlatformClusterGatewaysContent />', () => {
  let container: { restore: () => void };
  beforeEach(() => {
    container = mockContainerWidth(1100);
  });
  afterEach(() => container.restore());

  it('lists the Gateways, failing ones first, and shows the first below', async () => {
    await renderInTestApp(<Harness />);
    const table = screen.getAllByRole('grid')[0];
    const names = within(table)
      .getAllByRole('button')
      .map(button => button.textContent);
    // The internal Gateway has a failing route, not a failing condition: the
    // classic order (by the Gateway's conditions) keeps the name order.
    expect(names).toEqual(['giantswarm-default', 'payments-internal']);
    expect(gatewayButton('giantswarm-default')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'giantswarm-default' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Gateway in envoy-gateway-system · class giantswarm-default',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('1 failing')).toBeInTheDocument();
  });

  it('shows another Gateway once it is selected', async () => {
    await renderInTestApp(<Harness />);
    fireEvent.click(gatewayButton('payments-internal'));
    expect(screen.getByTestId('selected')).toHaveTextContent(
      'payments/payments-internal',
    );
    const routes = screen.getAllByRole('region', { name: 'HTTP routes' })[0];
    expect(within(routes).getByText('ledger-api')).toBeInTheDocument();
    expect(within(routes).getByText('Not accepted')).toBeInTheDocument();
    expect(
      within(routes).getByText('NoMatchingListenerHostname'),
    ).toBeInTheDocument();
    const policies = screen.getAllByRole('region', {
      name: 'Envoy Gateway policies',
    })[0];
    expect(within(policies).getByText('This gateway')).toBeInTheDocument();
  });

  it('falls back to the first Gateway for one the cluster does not have', async () => {
    await renderInTestApp(<Harness initial="nowhere/none" />);
    expect(gatewayButton('giantswarm-default')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('finds a Gateway by a hostname on it and selects it', async () => {
    await renderInTestApp(<Harness />);
    fireEvent.change(
      screen.getByRole('searchbox', {
        name: 'Find a gateway by hostname, route or policy',
      }),
      { target: { value: 'ledger.internal' } },
    );
    await waitFor(() =>
      expect(screen.getByTestId('selected')).toHaveTextContent(
        'payments/payments-internal',
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'giantswarm-default' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^Hostname:/)).toHaveTextContent(
      'Hostname: ledger.internal.example.com (route ledger-api)',
    );
    const routes = screen.getAllByRole('region', { name: 'HTTP routes' })[0];
    expect(routes.querySelector('mark')).toHaveTextContent('ledger.internal');
  });

  it('says when no Gateway matches, and shows no Gateway below', async () => {
    await renderInTestApp(<Harness />);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'nothing-like-it' },
    });
    expect(
      await screen.findByText(
        'No gateway has a route, hostname, policy or ReferenceGrant matching "nothing-like-it".',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'giantswarm-default' }),
    ).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Listeners' })).toBeNull();
  });

  it('keeps the selected Gateway while the query finds something on it', async () => {
    await renderInTestApp(<Harness initial="payments/payments-internal" />);
    // On both Gateways: a hostname on each ends in example.com.
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'example.com' },
    });
    expect(gatewayButton('giantswarm-default')).toBeInTheDocument();
    expect(screen.getByTestId('selected')).toHaveTextContent(
      'payments/payments-internal',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'payments-internal' }),
    ).toBeInTheDocument();
  });

  it('shows the ReferenceGrants the selected Gateway and its routes use', async () => {
    await renderInTestApp(<Harness />);
    const onMain = screen.getAllByRole('region', {
      name: 'ReferenceGrants',
    })[0];
    expect(within(onMain).getByText('from-shop')).toBeInTheDocument();
    expect(within(onMain).getByText('HTTPRoute in shop')).toBeInTheDocument();
    expect(within(onMain).getByText('Service catalog')).toBeInTheDocument();
    expect(within(onMain).getByText('storefront')).toBeInTheDocument();
    expect(within(onMain).queryByText('payments-gateways')).toBeNull();

    fireEvent.click(gatewayButton('payments-internal'));
    const onInternal = screen.getAllByRole('region', {
      name: 'ReferenceGrants',
    })[0];
    expect(
      within(onInternal).getByText('payments-gateways'),
    ).toBeInTheDocument();
    expect(within(onInternal).getByText('any Secret')).toBeInTheDocument();
    expect(within(onInternal).getByText('Gateways')).toBeInTheDocument();
  });

  it('finds a Gateway by a ReferenceGrant on it', async () => {
    await renderInTestApp(<Harness />);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'payments-gate' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('selected')).toHaveTextContent(
        'payments/payments-internal',
      ),
    );
    expect(screen.getByText(/^ReferenceGrant:/)).toHaveTextContent(
      'ReferenceGrant: payments-gateways',
    );
  });

  it('shows why the ReferenceGrants could not be loaded', async () => {
    await renderInTestApp(
      <Harness referenceGrantsError={new Error('timeout')} />,
    );
    expect(
      screen.getByText('ReferenceGrants could not be loaded.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Not attached to a gateway' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('from-old')).toBeNull();
  });

  it('shows the policy counts as unknown when the policies fail to load', async () => {
    await renderInTestApp(<Harness policiesError={new Error('timeout')} />);
    const unknown = screen.getAllByLabelText('Policies could not be loaded');
    expect(unknown).toHaveLength(2);
    expect(unknown[0]).toHaveTextContent('—');
  });

  it('lists what no Gateway takes in a section of its own', async () => {
    await renderInTestApp(<Harness />);
    expect(
      screen.getByRole('heading', { name: 'Not attached to a gateway' }),
    ).toBeInTheDocument();
    const unattached = screen.getByRole('region', {
      name: 'Not attached to a gateway',
    });
    const routes = within(unattached).getByRole('region', {
      name: 'HTTP routes',
    });
    expect(within(routes).getByText('event-webhooks')).toBeInTheDocument();
    expect(
      within(routes).getByText('ListenerSet events/events-https, https'),
    ).toBeInTheDocument();
    const grantsSection = within(unattached).getByRole('region', {
      name: 'ReferenceGrants',
    });
    expect(within(grantsSection).getByText('from-old')).toBeInTheDocument();
    expect(
      within(grantsSection).getByText('No route found'),
    ).toBeInTheDocument();
  });

  it('shows an alert in place of the Gateways when the metrics fail', async () => {
    await renderInTestApp(<Harness error={new Error('Mimir is down')} />);
    expect(
      screen.getByText('Gateway API metrics could not be loaded.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'giantswarm-default' }),
    ).toBeNull();
    // The policies load on their own and stay listed.
    expect(screen.getByText('payments-internal-ip-allow')).toBeInTheDocument();
  });
});

describe('<PlatformClusterGatewaysContent /> at phone width', () => {
  let layout: { restore: () => void };
  beforeEach(() => {
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it('marks what the finder found in stacked route rows', async () => {
    await renderInTestApp(<Harness initial="payments/payments-internal" />);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ledger-api:9090' },
    });
    const routes = screen.getAllByRole('list', { name: 'HTTP routes' })[0];
    expect(routes.querySelector('mark')).toHaveTextContent('ledger-api:9090');
  });

  it('stacks the Gateways with their counts', async () => {
    await renderInTestApp(<Harness />);
    const list = screen.getByRole('list', { name: 'Gateways' });
    expect(within(list).getAllByText(/1 listener/)).toHaveLength(2);
    expect(gatewayButton('giantswarm-default')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
