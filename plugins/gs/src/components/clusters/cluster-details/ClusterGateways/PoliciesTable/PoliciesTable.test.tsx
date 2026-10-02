import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import { GatewayPolicy } from '../../../../hooks/gatewayPolicies';
import { PoliciesTable } from './PoliciesTable';

const accepted: GatewayPolicy = {
  id: 'SecurityPolicy/team-a/ok',
  kind: 'SecurityPolicy',
  namespace: 'team-a',
  name: 'ok',
  targets: [{ kind: 'HTTPRoute', name: 'shop', source: 'targetRefs' }],
  ancestors: [
    {
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
          { ...dangling, targets: [], status: { status: 'not-available' } },
        ]}
        isLoading={false}
      />,
    );
    // Status and the targets column both say so.
    expect(screen.getAllByText('Not available')).toHaveLength(2);
    expect(
      screen.getByText(
        'Some policy targets and status are not available on this cluster.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('No status reported')).not.toBeInTheDocument();
  });
});
