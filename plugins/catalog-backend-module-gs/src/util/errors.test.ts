import { NotFoundError, ServiceUnavailableError } from '@backstage/errors';
import { isTransientError, readErrorInfo } from './errors';

describe('isTransientError', () => {
  it.each([
    new ServiceUnavailableError(
      'Registry unreachable at https://gsoci.azurecr.io/acr/v1/charts/giantswarm/release-aks/_tags: request timed out',
    ),
    new Error(
      'Request failed for https://api.github.com/repos/giantswarm/backstage-catalogs, 504 Gateway Timeout',
    ),
    new Error(
      'Request failed for https://api.github.com/repos/x, 429 Too Many Requests',
    ),
    new Error('connect ECONNREFUSED 172.31.110.136:5432'),
    new Error('socket hang up'),
    new Error('Invalid response body'),
  ])('treats %s as transient', error => {
    expect(isTransientError(error)).toBe(true);
  });

  it.each([
    new NotFoundError('Chart not found'),
    new Error(
      'Request failed for https://api.github.com/repos/giantswarm/backstage-catalogs, 401 Unauthorized',
    ),
    new Error('metadata.annotations must be a valid object'),
  ])('treats %s as actionable', error => {
    expect(isTransientError(error)).toBe(false);
  });

  it('handles non-Error values', () => {
    expect(isTransientError('socket hang up')).toBe(true);
    expect(isTransientError(undefined)).toBe(false);
  });

  it('reads errors that lost their prototype in transit', () => {
    expect(isTransientError({ name: 'ServiceUnavailableError' })).toBe(true);
    expect(isTransientError({ message: '504 Gateway Timeout' })).toBe(true);
    expect(isTransientError({})).toBe(false);
    expect(readErrorInfo({})).toEqual({ name: undefined, message: '' });
  });
});
