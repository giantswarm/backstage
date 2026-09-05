import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import {
  MANAGEMENT_CLUSTER_LABEL,
  MCPServer,
  MCPServerState,
} from '../../lib/k8s';
import { FleetCoverage } from './FleetCoverage';

function makeServer(
  name: string,
  options: { family?: string; mc?: string; state?: MCPServerState } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        labels: options.mc ? { [MANAGEMENT_CLUSTER_LABEL]: options.mc } : {},
      },
      spec: {
        type: 'streamable-http',
        ...(options.family ? { family: { name: options.family } } : {}),
      },
      status: { state: options.state ?? 'Connected' },
    } as never,
    'gazelle',
  );
}

const FLEET = ['agama', 'alba', 'gaggle', 'garm'];

describe('FleetCoverage', () => {
  it('measures each family against the fleet and names the gaps', async () => {
    await renderInTestApp(
      <FleetCoverage
        servers={[
          ...FLEET.map(mc =>
            makeServer(`k8s-${mc}`, {
              family: 'kubernetes',
              mc,
              state: mc === 'garm' ? 'Failed' : 'Connected',
            }),
          ),
          ...['gaggle', 'garm'].map(mc =>
            makeServer(`capi-${mc}`, { family: 'capi', mc }),
          ),
          // Integration servers have no cluster and do not count.
          makeServer('miro'),
        ]}
      />,
    );

    expect(
      screen.getByText(
        /4 management clusters · 2 families · 1\/2 deployed on every cluster/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('2/4 clusters')).toBeInTheDocument();
    expect(screen.getByText('4/4 clusters')).toBeInTheDocument();
    expect(screen.getByText('1 degraded')).toBeInTheDocument();
    expect(
      screen.getByText('Not deployed on 2 clusters: agama, alba'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'capi coverage' }),
    ).toHaveAttribute('aria-valuenow', '2');
    expect(
      screen.getByRole('progressbar', { name: 'kubernetes coverage' }),
    ).toHaveAttribute('aria-valuemax', '4');
  });

  it('says so when the installation federates no standard family', async () => {
    await renderInTestApp(<FleetCoverage servers={[makeServer('miro')]} />);

    expect(
      screen.getByText(/No federated \(management-cluster-labelled\) servers/),
    ).toBeInTheDocument();
  });
});
