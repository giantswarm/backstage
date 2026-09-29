import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { apiResourceQueryOptions } from './queryFactories';

function namedError(name: string) {
  const error = new Error('boom');
  error.name = name;
  return error;
}

describe('apiResourceQueryOptions', () => {
  const { retry } = apiResourceQueryOptions(
    {} as KubernetesApi,
    'cluster-a',
    'test.example.io',
    'v1',
    'widgets',
  );

  it('retries a transient failure once', () => {
    expect(retry(0, namedError('Error'))).toBe(true);
    expect(retry(1, namedError('Error'))).toBe(false);
  });

  it('does not retry a 401', () => {
    expect(retry(0, namedError('UnauthorizedError'))).toBe(false);
  });
});
