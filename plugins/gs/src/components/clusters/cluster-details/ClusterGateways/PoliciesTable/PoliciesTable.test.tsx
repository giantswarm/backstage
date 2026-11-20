import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import {
  mockContainerWidth,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { GatewayPolicy } from '../../../../utils/gatewayPolicies';
import { PoliciesTable } from './PoliciesTable';

const accepted: GatewayPolicy = {
  id: 'SecurityPolicy/team-a/ok',
  kind: 'SecurityPolicy',
  namespace: 'team-a',
  name: 'ok',
  targets: [{ kind: 'HTTPRoute', name: 'shop', source: 'targetRefs' }],
  targetsLoaded: true,
  ancestors: [
    {
      id: 'envoy-gateway-system/giantswarm-default/https//Gateway/',
      kind: 'Gateway',
      namespace: 'envoy-gateway-system',
      name: 'giantswarm-default',
      sectionName: 'https',
      accepted: { status: 'true', reason: 'Accepted' },
    },
  ],
  status: { status: 'not-reported' },
};

const rejected: GatewayPolicy = {
  ...accepted,
  id: 'SecurityPolicy/team-z/rejected',
  namespace: 'team-z',
  name: 'rejected',
  ancestors: [
    {
      ...accepted.ancestors[0],
      accepted: { status: 'false', reason: 'Invalid' },
    },
  ],
};

const dangling: GatewayPolicy = {
  ...accepted,
  id: 'SecurityPolicy/team-y/dangling',
  namespace: 'team-y',
  name: 'dangling',
  targets: [{ kind: 'HTTPRoute', name: 'gone', source: 'targetRefs' }],
  ancestors: [],
  status: { status: 'not-reported' },
};

function rowOf(name: string) {
  return screen
    .getAllByRole('row')
    .find(row => within(row).queryByText(name, { exact: true }))!;
}

describe('<PoliciesTable />', () => {
  it('lists rejected policies first, then policies without status', async () => {
    await renderInTestApp(
      <PoliciesTable
        clusterName="demo"
        policies={[accepted, dangling, rejected]}
        isLoading={false}
      />,
    );
    const names = screen
      .getAllByRole('row')
      .map(row =>
        ['ok', 'dangling', 'rejected'].find(n =>
          within(row).queryByText(n, { exact: true }),
        ),
      )
      .filter(Boolean);
    expect(names).toEqual(['rejected', 'dangling', 'ok']);
    expect(within(rowOf('rejected')).getByText('Invalid')).toBeInTheDocument();
  });

  it('warns when a policy has no status reported', async () => {
    await renderInTestApp(
      <PoliciesTable
        clusterName="demo"
        policies={[dangling]}
        isLoading={false}
      />,
    );
    expect(screen.getByText('No status reported')).toBeInTheDocument();
  });

  it('shows status as not available on an older bundle, without a warning', async () => {
    await renderInTestApp(
      <PoliciesTable
        clusterName="demo"
        policies={[
          {
            ...dangling,
            targets: [],
            status: { status: 'not-available', cause: 'not-exported' },
          },
        ]}
        isLoading={false}
      />,
    );
    // Status and the targets column both say so.
    expect(screen.getAllByText('Not available')).toHaveLength(2);
    expect(
      screen.getByText(
        'Policy status is not available on this cluster. It needs observability-bundle 3.6.0 or newer, as do targets set with targetRefs. If the bundle is newer, Envoy Gateway has reported no status for these policies yet.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('No status reported')).not.toBeInTheDocument();
  });

  it('says failed targets are retried, and shows them as not available instead of none', async () => {
    await renderInTestApp(
      <PoliciesTable
        clusterName="demo"
        policies={[{ ...accepted, targets: [], targetsLoaded: false }]}
        isLoading={false}
      />,
    );
    expect(within(rowOf('ok')).getByText('Not available')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Some policy targets or status could not be loaded. They are retried automatically.',
      ),
    ).toBeInTheDocument();
  });

  it('names the ancestor with its namespace and port', async () => {
    await renderInTestApp(
      <PoliciesTable
        clusterName="demo"
        isLoading={false}
        policies={[
          {
            ...accepted,
            ancestors: [{ ...accepted.ancestors[0], port: '443' }],
          },
        ]}
      />,
    );
    expect(
      screen.getByText(
        'envoy-gateway-system/giantswarm-default · https · port 443',
      ),
    ).toBeInTheDocument();
  });

  it('says a policy without targetRef or targetRefs selects by labels', async () => {
    await renderInTestApp(
      <PoliciesTable
        clusterName="demo"
        isLoading={false}
        policies={[{ ...accepted, targets: [] }]}
      />,
    );
    expect(screen.getByText('Selected by labels')).toBeInTheDocument();
  });

  describe('narrower than all columns', () => {
    let container: { restore: () => void };
    beforeEach(() => {
      container = mockContainerWidth(700);
    });
    afterEach(() => container.restore());

    it('moves the kind into the policy description', async () => {
      await renderInTestApp(
        <PoliciesTable
          clusterName="demo"
          policies={[accepted]}
          isLoading={false}
        />,
      );
      expect(
        screen.queryByRole('columnheader', { name: 'Kind' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('SecurityPolicy · team-a')).toBeInTheDocument();
    });
  });

  describe('at phone width', () => {
    let layout: { restore: () => void };
    beforeEach(() => {
      layout = mockPhoneLayout();
    });
    afterEach(() => layout.restore());

    it('stacks the policies with their status, facts and ancestors', async () => {
      await renderInTestApp(
        <PoliciesTable
          clusterName="demo"
          policies={[accepted, dangling, rejected]}
          isLoading={false}
        />,
      );
      const list = screen.getByRole('list', { name: 'Envoy Gateway policies' });
      const items = within(list).getAllByRole('listitem');
      const itemOf = (name: string) =>
        items.find(item => within(item).queryByText(name, { exact: true }))!;
      expect(
        within(itemOf('rejected')).getByText('Accepted: False · Invalid'),
      ).toBeInTheDocument();
      expect(itemOf('rejected')).toHaveTextContent(
        'Accepted by envoy-gateway-system/giantswarm-default · https: False · Invalid',
      );
      expect(itemOf('ok')).toHaveTextContent('SecurityPolicy');
      expect(itemOf('ok')).toHaveTextContent('targets HTTPRoute/shop');
      expect(itemOf('dangling')).toHaveTextContent('targets HTTPRoute/gone');
      expect(
        within(itemOf('dangling')).getByText('No status reported'),
      ).toBeInTheDocument();
      expect(itemOf('dangling')).toHaveTextContent('Target missing');
    });

    it('shows the worst of several ancestors, and status an older bundle lacks', async () => {
      await renderInTestApp(
        <PoliciesTable
          clusterName="demo"
          policies={[
            {
              ...accepted,
              id: 'SecurityPolicy/team-a/split',
              name: 'split',
              ancestors: [
                accepted.ancestors[0],
                {
                  ...accepted.ancestors[0],
                  id: 'other',
                  name: 'other',
                  accepted: { status: 'false', reason: 'Conflicted' },
                },
              ],
            },
            {
              ...accepted,
              id: 'SecurityPolicy/team-a/old',
              name: 'old',
              targets: [],
              ancestors: [],
              status: { status: 'not-available', cause: 'not-exported' },
            },
          ]}
          isLoading={false}
        />,
      );
      const list = screen.getByRole('list', { name: 'Envoy Gateway policies' });
      const itemOf = (name: string) =>
        within(list)
          .getAllByRole('listitem')
          .find(item => within(item).queryByText(name, { exact: true }))!;
      expect(
        within(itemOf('split')).getByText('Accepted: False · Conflicted'),
      ).toBeInTheDocument();
      expect(itemOf('split')).toHaveTextContent(
        'Accepted by envoy-gateway-system/giantswarm-default · https: True',
      );
      expect(
        within(itemOf('old')).getByText('Accepted: Not available'),
      ).toBeInTheDocument();
      expect(itemOf('old')).toHaveTextContent('targets not available');
    });

    it('says targets are not available when they could not be loaded', async () => {
      await renderInTestApp(
        <PoliciesTable
          clusterName="demo"
          policies={[{ ...accepted, targets: [], targetsLoaded: false }]}
          isLoading={false}
        />,
      );
      expect(
        screen.getByRole('list', { name: 'Envoy Gateway policies' }),
      ).toHaveTextContent('targets not available');
    });
  });
});
