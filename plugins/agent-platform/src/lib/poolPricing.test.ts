import type { InstanceShape } from './clusterManager';
import {
  describeHourlyRange,
  poolPriceOf,
  totalHourlyCost,
} from './poolPricing';

const shape = (
  instanceType: string,
  pricePerHourUSD?: number,
): InstanceShape => ({
  instanceType,
  size: instanceType.split('.')[1],
  vcpu: 4,
  memoryGiB: 16,
  gpus: 1,
  gpuMemoryGiB: 24,
  usableVcpu: 3,
  usableMemoryGiB: 12,
  pricePerHourUSD,
  priceSource:
    pricePerHourUSD === undefined
      ? undefined
      : 'AWS EC2 on-demand Linux list price, EU (Frankfurt) (eu-central-1)',
  priceAsOf: pricePerHourUSD === undefined ? undefined : '2026-09-17',
});

const shapes = [
  shape('g6.xlarge', 1.0064),
  shape('g6.2xlarge', 1.22249),
  shape('g6.4xlarge'),
];

describe('poolPriceOf', () => {
  it('prices a pool of one size by its running nodes', () => {
    const price = poolPriceOf(
      { instanceTypes: ['g6.xlarge'], readyReplicas: 2 },
      shapes,
    );

    expect(price).toMatchObject({
      perNodeMinUSD: 1.0064,
      perNodeMaxUSD: 1.0064,
      nodes: 2,
      nowMinUSD: 2.0128,
      nowMaxUSD: 2.0128,
      unpricedSizes: [],
      source:
        'AWS EC2 on-demand Linux list price, EU (Frankfurt) (eu-central-1), as of 2026-09-17',
    });
  });

  it('gives a pool of several sizes the range, and names the unpriced ones', () => {
    const price = poolPriceOf(
      {
        instanceTypes: ['g6.xlarge', 'g6.2xlarge', 'g6.4xlarge'],
        readyReplicas: 1,
      },
      shapes,
    );

    expect(price?.perNodeMinUSD).toBe(1.0064);
    expect(price?.perNodeMaxUSD).toBe(1.22249);
    expect(price?.unpricedSizes).toEqual(['g6.4xlarge']);
  });

  it('matches a size named without its family', () => {
    expect(
      poolPriceOf({ instanceTypes: ['2xlarge'], readyReplicas: 1 }, shapes)
        ?.perNodeMinUSD,
    ).toBe(1.22249);
  });

  it('costs nothing now at scale-to-zero, and still knows the node price', () => {
    const price = poolPriceOf(
      { instanceTypes: ['g6.xlarge'], readyReplicas: 0 },
      shapes,
    );
    expect(price?.nowMinUSD).toBe(0);
    expect(price?.perNodeMinUSD).toBe(1.0064);
  });

  it('has no price when none of its sizes carries one', () => {
    expect(
      poolPriceOf({ instanceTypes: ['g6.4xlarge'], readyReplicas: 1 }, shapes),
    ).toBeUndefined();
    expect(
      poolPriceOf({ instanceTypes: ['p5.48xlarge'], readyReplicas: 1 }, shapes),
    ).toBeUndefined();
  });
});

describe('describeHourlyRange', () => {
  it('words one price, or a range', () => {
    expect(describeHourlyRange(1.0064, 1.0064)).toBe('$1.01/h');
    expect(describeHourlyRange(1.0064, 1.22249)).toBe('$1.01–1.22/h');
  });
});

describe('totalHourlyCost', () => {
  it('adds up the priced pools, and is absent when none is priced', () => {
    const one = poolPriceOf(
      { instanceTypes: ['g6.xlarge'], readyReplicas: 2 },
      shapes,
    );
    const two = poolPriceOf(
      { instanceTypes: ['g6.xlarge', 'g6.2xlarge'], readyReplicas: 1 },
      shapes,
    );
    expect(totalHourlyCost([one, two, undefined])).toEqual({
      minUSD: 2.0128 + 1.0064,
      maxUSD: 2.0128 + 1.22249,
    });
    expect(totalHourlyCost([undefined])).toBeUndefined();
  });
});
