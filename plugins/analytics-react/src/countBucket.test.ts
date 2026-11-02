import { portalEvents } from './events';
import {
  COUNT_BUCKETS,
  countBucket,
  countBucketOrUnknown,
} from './countBucket';

describe('countBucket', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [2, '2-4'],
    [4, '2-4'],
    [5, '5-9'],
    [9, '5-9'],
    [10, '10-19'],
    [19, '10-19'],
    [20, '20-49'],
    [49, '20-49'],
    [50, '50-99'],
    [99, '50-99'],
    [100, '100+'],
    [12345, '100+'],
  ])('puts %i in %s', (count, bucket) => {
    expect(countBucket(count)).toBe(bucket);
  });

  it.each([-1, NaN])('puts %s in 0, never in the largest bucket', count => {
    expect(countBucket(count)).toBe('0');
  });

  it('puts every count in a listed bucket', () => {
    for (let count = 0; count <= 120; count++) {
      expect(COUNT_BUCKETS).toContain(countBucket(count));
    }
  });
});

describe('countBucketOrUnknown', () => {
  it('buckets a known count', () => {
    expect(countBucketOrUnknown(3)).toBe('2-4');
  });

  it.each([undefined, NaN])('says unknown for %s', count => {
    expect(countBucketOrUnknown(count)).toBe('unknown');
  });
});

describe('the count attributes', () => {
  it.each([
    ['AgentPlatform.agentViewed', 'skills'],
    ['AgentPlatform.sessionViewed', 'turns'],
  ] as const)('%s takes the buckets for %s', (name, attribute) => {
    const spec = portalEvents[name].attributes as Record<
      string,
      readonly string[]
    >;
    expect(spec[attribute]).toEqual(COUNT_BUCKETS);
  });

  it.each([
    ['AgentPlatform.agentViewed', 'tools'],
    ['AgentPlatform.messageSent', 'turns'],
    ['AgentPlatform.customizeViewed', 'agents'],
    ['AgentPlatform.customizeViewed', 'toolchains'],
  ] as const)('%s takes the buckets and unknown for %s', (name, attribute) => {
    const spec = portalEvents[name].attributes as Record<
      string,
      readonly string[]
    >;
    expect(spec[attribute]).toEqual([...COUNT_BUCKETS, 'unknown']);
  });
});
