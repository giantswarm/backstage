import { render, screen, within } from '@testing-library/react';
import { MCPServer } from '../../../lib/k8s';
import {
  ConnectorTechnicalDetails,
  technicalDetailsOpenByDefault,
} from './ConnectorTechnicalDetails';

jest.mock('@giantswarm/backstage-plugin-flux-react', () => ({
  GitOpsCard: () => <p>Managed through GitOps</p>,
}));

function makeServer(opts: {
  name: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: opts.name,
        namespace: 'muster',
        labels: opts.labels,
        annotations: opts.annotations,
      },
      spec: {
        type: 'streamable-http',
        url: `https://${opts.name}.example.test/mcp`,
        autoStart: true,
        timeout: 30,
        ...opts.spec,
      },
      status: { state: 'Connected', ...opts.status },
    } as never,
    'gazelle',
  );
}

/** The value beside a fact's label, inside the card titled `card`. */
function fact(card: string, label: string) {
  let region: HTMLElement | null = screen.getByRole('heading', { name: card });
  while (region && !region.querySelector('dl')) {
    region = region.parentElement;
  }
  return within(region!).getByText(label).closest('dt')!.nextElementSibling;
}

function renderServer(server: MCPServer) {
  return render(
    <ConnectorTechnicalDetails
      server={server}
      isFamily={false}
      installation="gazelle"
    />,
  );
}

describe('ConnectorTechnicalDetails', () => {
  it('shows a connector added through muster with its address, configuration and authentication', () => {
    renderServer(
      makeServer({ name: 'jira', spec: { auth: { type: 'oauth' } } }),
    );

    expect(screen.getByRole('heading', { name: 'Resource' })).toBeVisible();
    expect(screen.getByText('muster/jira')).toBeVisible();
    expect(screen.getByText('Added through muster, not Git')).toBeVisible();
    expect(screen.queryByText('Managed through GitOps')).toBeNull();

    expect(fact('Configuration', 'Timeout')).toHaveTextContent('30s');
    expect(fact('Configuration', 'URL')).toHaveTextContent(
      'https://jira.example.test/mcp',
    );

    expect(fact('Authentication', 'Mode')).toHaveTextContent(
      'Own account (OAuth sign-in)',
    );
    // A healthy server with nothing in its status has no health card.
    expect(screen.queryByRole('heading', { name: 'Health' })).toBeNull();
  });

  it('leaves out the authentication card where there is no sign-in', () => {
    renderServer(makeServer({ name: 'grafana' }));
    expect(
      screen.queryByRole('heading', { name: 'Authentication' }),
    ).toBeNull();
  });

  it('names the GitOps source and the release behind a managed connector', () => {
    renderServer(
      makeServer({
        name: 'grafana',
        labels: {
          'app.kubernetes.io/managed-by': 'Helm',
          'helm.toolkit.fluxcd.io/name': 'grafana-mcp',
          'helm.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
          'kustomize.toolkit.fluxcd.io/name': 'collection',
          'kustomize.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
        },
      }),
    );

    expect(screen.getByText('Managed through GitOps')).toBeVisible();
    expect(fact('Resource', 'HelmRelease')).toHaveTextContent(
      'flux-giantswarm/grafana-mcp',
    );
    expect(fact('Resource', 'Kustomization')).toHaveTextContent(
      'flux-giantswarm/collection',
    );
    expect(screen.queryByText('Origin')).toBeNull();
  });

  it('explains a failed connector and opens on arrival for it', () => {
    const failed = makeServer({
      name: 'jira',
      status: {
        state: 'Failed',
        lastError: 'dial tcp: connection refused',
        consecutiveFailures: 4,
      },
    });
    renderServer(failed);

    expect(fact('Health', 'Consecutive failures')).toHaveTextContent('4');
    expect(screen.getByText('dial tcp: connection refused')).toBeVisible();
    expect(
      technicalDetailsOpenByDefault({ kind: 'server', server: failed }),
    ).toBe(true);
  });

  it('stays folded for a healthy, a turned-off or a family connector', () => {
    const healthy = makeServer({ name: 'jira' });
    const off = makeServer({
      name: 'jira',
      spec: { suspended: true },
      status: { state: 'Failed' },
    });
    expect(
      technicalDetailsOpenByDefault({ kind: 'server', server: healthy }),
    ).toBe(false);
    expect(technicalDetailsOpenByDefault({ kind: 'server', server: off })).toBe(
      false,
    );
    expect(
      technicalDetailsOpenByDefault({
        kind: 'family',
        family: 'kubernetes',
        servers: [off],
      }),
    ).toBe(false);
  });

  it('shows one instance of a family and points to the Instances tab', () => {
    const walrus = makeServer({
      name: 'walrus-mcp-kubernetes',
      status: { state: 'Failed', lastError: 'boom' },
    });
    render(
      <ConnectorTechnicalDetails
        server={walrus}
        isFamily
        installation="gazelle"
      />,
    );

    expect(
      screen.getByText(/each instance's own configuration, health and/),
    ).toHaveTextContent(/Shown for instance walrus-mcp-kubernetes;/);
    // Per instance, on the Instances tab.
    expect(screen.queryByRole('heading', { name: 'Health' })).toBeNull();
    expect(screen.queryByText('MCPServer')).toBeNull();
  });
});
