import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ModelCacheRow } from '../../hooks/useClusterManager';
import type { CacheClaim, ManagedCluster } from '../../lib/clusterManager';
import {
  ModelCachePanel,
  NO_MODEL_CACHE,
  describeTotal,
  describeUse,
} from './ModelCachePanel';

const CLUSTER: ManagedCluster = {
  name: 'wc1',
  namespace: 'org-acme',
  organization: 'acme',
  releaseVersion: '31.0.0',
  ownCluster: false,
  gpuOperator: { status: 'absent' },
  serving: {
    status: 'present',
    provider: 'cluster-manager',
    readiness: {
      release: null,
      children: [],
      controllers: [],
      configs: null,
      backend: {},
      presets: null,
      modelsGateway: null,
      cache: { enabled: true, claim: 'hf-cache' },
    },
  },
  poolReleases: [],
  commitTarget: null,
};

const CLAIM: CacheClaim = {
  namespace: 'model-serving',
  name: 'hf-cache',
  phase: 'Bound',
  volume: 'pvc-1',
  zone: 'eu-central-1b',
  capacity: '100Gi',
  capacityGiB: 100,
  storageClass: 'agent-platform-connectivity-hf-cache',
  tier: { type: 'gp3', iops: 3000, throughputMiBps: 500 },
  reclaimPolicy: 'Delete',
  created: '2026-09-18T20:31:04Z',
  price: {
    monthlyUSD: 27.37,
    source: 'AWS EBS gp3 list price, EU (Frankfurt) (eu-central-1)',
    asOf: '2026-09-19',
  },
  mounted: true,
};

const row = (
  claim: CacheClaim,
  installation = 'inst-1',
  cluster = CLUSTER,
): ModelCacheRow => ({
  id: `${installation}/${cluster.name}/${claim.name}`,
  installation,
  cluster,
  claim,
});

describe('ModelCachePanel', () => {
  it('lists each claim with its size, price, since when and what uses it, and offers Remove cache where cluster-manager has the tool', async () => {
    const onRemove = jest.fn();
    await renderInTestApp(
      <ModelCachePanel
        rows={[
          row(CLAIM),
          row(
            {
              ...CLAIM,
              name: 'hf-cache-eu-central-1a',
              zone: 'eu-central-1a',
              mounted: undefined,
              price: undefined,
              tier: undefined,
              tierNote:
                'StorageClass old of claim model-serving/hf-cache-eu-central-1a cannot be read',
              priceNote:
                "no price: the volume's tier is not known (its StorageClass could not be read)",
            },
            'inst-2',
          ),
        ]}
        isLoading={false}
        removable={['inst-1']}
        onRemove={onRemove}
      />,
    );
    expect(
      screen.getByText(
        /Standing: \$27\.37\/month across 1 claim at list prices, 1 more without a price/,
      ),
    ).toBeInTheDocument();
    const rowOf = (installation: string) =>
      screen.getByText(installation).closest('tr') as HTMLElement;
    const mounted = rowOf('inst-1');
    expect(
      within(mounted).getByText('100 GiB gp3 at 500 MiB/s'),
    ).toBeInTheDocument();
    expect(within(mounted).getByText('$27.37/month')).toBeInTheDocument();
    expect(within(mounted).getByText('eu-central-1b')).toBeInTheDocument();
    expect(
      within(mounted).getByText(
        'Mounted by the serving slice — every pool of the cluster serves from it',
      ),
    ).toBeInTheDocument();
    const unpriced = rowOf('inst-2');
    expect(within(unpriced).getByText('no price')).toBeInTheDocument();
    expect(within(unpriced).getByText('100 GiB')).toBeInTheDocument();
    expect(within(unpriced).getByText('read-only')).toBeInTheDocument();
    expect(screen.getByTestId('cache-read-only')).toHaveTextContent(
      'inst-2: the installation’s cluster-manager does not offer remove_model_cache yet'.replace(
        '’',
        "'",
      ),
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Remove cache hf-cache on wc1' }),
    );
    expect(onRemove).toHaveBeenCalledWith(row(CLAIM));
  });

  it('says nothing stands when there is no claim', async () => {
    await renderInTestApp(
      <ModelCachePanel
        rows={[]}
        isLoading={false}
        removable={[]}
        onRemove={jest.fn()}
      />,
    );
    expect(screen.getByText(NO_MODEL_CACHE)).toBeInTheDocument();
    expect(screen.queryByTestId('cache-read-only')).not.toBeInTheDocument();
  });
});

describe('describeUse', () => {
  it('tells a mounted claim from one kept beside the slice’s and from one nothing mounts', () => {
    expect(describeUse(row(CLAIM))).toMatch(/^Mounted by the serving slice/);
    expect(describeUse(row({ ...CLAIM, mounted: undefined }))).toBe(
      'Kept — the serving slice mounts another claim',
    );
    const off: ManagedCluster = {
      ...CLUSTER,
      serving: { status: 'absent' },
    };
    expect(
      describeUse(row({ ...CLAIM, mounted: undefined }, 'inst-1', off)),
    ).toBe('Kept — nothing mounts it');
  });
});

describe('describeTotal', () => {
  it('sums the priced claims and counts the rest apart', () => {
    expect(describeTotal([])).toBeUndefined();
    expect(
      describeTotal([row({ ...CLAIM, price: undefined })]),
    ).toBeUndefined();
    expect(
      describeTotal([
        row(CLAIM),
        row({
          ...CLAIM,
          name: 'b',
          price: { ...CLAIM.price!, monthlyUSD: 65.45 },
        }),
        row({ ...CLAIM, name: 'c', price: undefined }),
      ]),
    ).toBe(
      '$92.82/month across 2 claims at list prices, 1 more without a price (its tier is not known)',
    );
  });
});
