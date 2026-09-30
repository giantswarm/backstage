import { getErrorMessage } from './errorMessages';

function namedError(name: string) {
  const error = new Error('boom');
  error.name = name;
  return error;
}

describe('getErrorMessage', () => {
  it('tells a missing resource apart from a failed fetch', () => {
    expect(
      getErrorMessage({
        error: namedError('NotFoundError'),
        resourceKind: 'KubeadmControlPlane',
        resourceName: 'my-cluster',
        resourceNamespace: 'org-test',
      }),
    ).toBe(
      'KubeadmControlPlane resource named "my-cluster" in namespace "org-test" not found.',
    );

    expect(
      getErrorMessage({
        error: namedError('Error'),
        resourceKind: 'KubeadmControlPlane',
        resourceName: 'my-cluster',
        resourceNamespace: 'org-test',
      }),
    ).toBe(
      'Failed to fetch KubeadmControlPlane resource named "my-cluster" in namespace "org-test".',
    );
  });

  it('leaves out the namespace for a cluster-scoped resource', () => {
    expect(
      getErrorMessage({
        error: namedError('ForbiddenError'),
        resourceKind: 'Node',
        resourceName: 'worker-1',
      }),
    ).toBe('Permission not sufficient to get Node resource named "worker-1".');
  });
});
