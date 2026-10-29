import { ClusterSecretStore } from './ClusterSecretStore';
import { SecretStore } from './SecretStore';

// @giantswarm/k8s-types still publishes v1beta1, which ESO no longer serves, so
// the compiler doesn't catch a class asking for it.
describe.each([
  ['SecretStore', SecretStore],
  ['ClusterSecretStore', ClusterSecretStore],
])('%s', (_kind, resourceClass) => {
  it('reads external-secrets.io/v1 only', () => {
    expect(resourceClass.supportedVersions).toEqual(['v1']);
  });
});
