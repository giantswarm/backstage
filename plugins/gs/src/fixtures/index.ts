/**
 * The gs plugin's fixtures (docs/fixtures.md), a subpath of their own
 * (`@giantswarm/backstage-plugin-gs/fixtures`) that only fixture modules and
 * tests import: the Mimir fixture API, and the Cluster API objects the fixture
 * Kubernetes API serves.
 */
export { MimirFixtureApi, mimirFixtureApi } from '../apis/mimir/fixtures';
export { gsKubernetesObjectsOf } from '../apis/kubernetes/fixtures/clusterObjects';
