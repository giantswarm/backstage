/**
 * Test utilities of the muster plugin for other plugins' tests
 * (`@giantswarm/backstage-plugin-muster/testUtils`): the drift guard of
 * fixture mode (docs/fixtures.md). Only tests import it.
 */
export { fixtureToolNames } from '../apis/fixtures/fixtureToolNames';
export {
  collectToolCalls,
  fixtureToolCoverage,
  type PluginToolCalls,
  type UnresolvedToolName,
} from './fixtureToolCoverage';
