import type { ErrorInfoUnion } from '@giantswarm/backstage-plugin-kubernetes-react';
import { collectClusterAccessUpdates, describeClusterError } from './utils';

function failure(cluster: string, error: Error): ErrorInfoUnion {
  return { cluster, error, retry: () => {} };
}

function named(name: string, message = 'boom'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('describeClusterError', () => {
  it('names the common failures and falls back to the message', () => {
    expect(describeClusterError(new Error('request timed out'))).toBe(
      'API unreachable (timeout)',
    );
    expect(describeClusterError(named('ForbiddenError'))).toBe(
      'Access forbidden',
    );
    expect(describeClusterError(named('NotFoundError'))).toBe('API not found');
    expect(describeClusterError(new Error('no route to host'))).toBe(
      'no route to host',
    );
    expect(describeClusterError(new Error(''))).toBe('API request failed');
  });
});

describe('collectClusterAccessUpdates', () => {
  it('reports a resolved list as healthy and a failed one as degraded', () => {
    expect(
      collectClusterAccessUpdates(
        [{ cluster: 'golem' }],
        [failure('wombat', new Error('request timed out'))],
        [],
      ),
    ).toEqual([
      { installation: 'golem', state: 'healthy' },
      {
        installation: 'wombat',
        state: 'degraded',
        reason: 'API unreachable (timeout)',
      },
    ]);
  });

  it('reports a 404 as healthy: the apiserver answered, it just has no Cluster API', () => {
    expect(
      collectClusterAccessUpdates(
        [],
        [failure('snail', named('NotFoundError'))],
        [],
      ),
    ).toEqual([{ installation: 'snail', state: 'healthy' }]);
  });

  it('says nothing about a rejected request or an incompatible API version', () => {
    expect(
      collectClusterAccessUpdates(
        [],
        [
          failure('golem', named('RejectedError')),
          {
            type: 'incompatibility',
            cluster: 'wombat',
            incompatibility: {} as never,
          },
        ],
        [],
      ),
    ).toEqual([]);
  });

  it('says nothing about an installation switched off in the Cluster access widget', () => {
    // Both halves: a list that resolved before the switch, and one that failed.
    // Recording either would put the installation back in the status set that
    // `ClusterAccessConnector` just removed it from.
    expect(
      collectClusterAccessUpdates(
        [{ cluster: 'golem' }, { cluster: 'wombat' }],
        [failure('snail', new Error('request timed out'))],
        ['wombat', 'snail'],
      ),
    ).toEqual([{ installation: 'golem', state: 'healthy' }]);
  });
});
