import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import { mockPhoneLayout } from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { ReferenceGrant } from '../../../../utils/gatewayReferenceGrants';
import { ReferenceGrantsTable } from './ReferenceGrantsTable';

const mirror: ReferenceGrant = {
  id: 'monitoring/loki-mirror',
  namespace: 'monitoring',
  name: 'loki-mirror',
  from: [
    {
      group: 'gateway.networking.k8s.io',
      kind: 'HTTPRoute',
      namespace: 'loki',
    },
  ],
  to: [{ group: '', kind: 'Service', name: 'alloy' }],
};

const open: ReferenceGrant = {
  id: 'payments/billing',
  namespace: 'payments',
  name: 'billing',
  from: [
    {
      group: 'gateway.networking.k8s.io',
      kind: 'HTTPRoute',
      namespace: 'billing',
    },
    {
      group: 'gateway.networking.k8s.io',
      kind: 'GRPCRoute',
      namespace: 'billing',
    },
  ],
  to: [{ group: '', kind: 'Service' }],
};

const unreported: ReferenceGrant = {
  id: 'team-a/empty',
  namespace: 'team-a',
  name: 'empty',
  from: [],
  to: [],
};

function rowOf(name: string) {
  return screen
    .getAllByRole('row')
    .find(row => within(row).queryByText(name, { exact: true }))!;
}

describe('<ReferenceGrantsTable />', () => {
  it('lists each grant with what it lets reference what', async () => {
    await renderInTestApp(
      <ReferenceGrantsTable
        clusterName="demo"
        referenceGrants={[mirror, open, unreported]}
        isLoading={false}
      />,
    );
    const mirrorRow = rowOf('loki-mirror');
    expect(within(mirrorRow).getByText('monitoring')).toBeInTheDocument();
    expect(
      within(mirrorRow).getByText('HTTPRoute in loki'),
    ).toBeInTheDocument();
    expect(within(mirrorRow).getByText('Service alloy')).toBeInTheDocument();

    const openRow = rowOf('billing');
    expect(
      within(openRow).getByText('HTTPRoute in billing'),
    ).toBeInTheDocument();
    expect(
      within(openRow).getByText('GRPCRoute in billing'),
    ).toBeInTheDocument();
    expect(within(openRow).getByText('any Service')).toBeInTheDocument();

    expect(within(rowOf('empty')).getAllByText('Not reported')).toHaveLength(2);
  });

  it('names the cluster and the bundle when there are none', async () => {
    await renderInTestApp(
      <ReferenceGrantsTable
        clusterName="demo"
        referenceGrants={[]}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/No ReferenceGrants found/)).toHaveTextContent(
      'No ReferenceGrants found on cluster demo. Clusters on observability-bundle older than 3.3.0 do not report them.',
    );
    expect(screen.queryByText(/A ReferenceGrant lets/)).not.toBeInTheDocument();
  });

  it('explains nothing while loading', async () => {
    await renderInTestApp(
      <ReferenceGrantsTable
        clusterName="demo"
        referenceGrants={[]}
        isLoading
      />,
    );
    expect(screen.queryByText(/A ReferenceGrant lets/)).not.toBeInTheDocument();
  });

  it('explains grants above them', async () => {
    await renderInTestApp(
      <ReferenceGrantsTable
        clusterName="demo"
        referenceGrants={[mirror]}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/A ReferenceGrant lets/)).toHaveTextContent(
      'RefNotPermitted',
    );
  });

  it('shows why they could not be loaded', async () => {
    await renderInTestApp(
      <ReferenceGrantsTable
        clusterName="demo"
        referenceGrants={[]}
        isLoading={false}
        error={new Error('Mimir is down')}
      />,
    );
    expect(
      screen.getByText('ReferenceGrants could not be loaded.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  describe('at phone width', () => {
    let layout: { restore: () => void };
    beforeEach(() => {
      layout = mockPhoneLayout();
    });
    afterEach(() => layout.restore());

    it('stacks the grants with their namespace, from and to', async () => {
      await renderInTestApp(
        <ReferenceGrantsTable
          clusterName="demo"
          referenceGrants={[mirror, open]}
          isLoading={false}
        />,
      );
      const list = screen.getByRole('list', { name: 'ReferenceGrants' });
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('monitoring');
      expect(items[0]).toHaveTextContent('from HTTPRoute in loki');
      expect(items[0]).toHaveTextContent('to Service alloy');
      expect(items[1]).toHaveTextContent(
        'from HTTPRoute in billing, GRPCRoute in billing',
      );
      expect(items[1]).toHaveTextContent('to any Service');
    });
  });
});
