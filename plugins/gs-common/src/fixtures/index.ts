/**
 * The fixture mode's data (docs/fixtures.md): builders and the seeded base
 * data set every fixture handler shares. A subpath of its own
 * (`@giantswarm/backstage-plugin-gs-common/fixtures`) so nothing reaches a
 * production build through the package's main entry; only fixture modules
 * and tests import it.
 */
export * from './builders';
export * from './dataSet';
export * from './managerBuilders';
export {
  createNamer,
  fixtureSentence,
  MAX_NAME_LENGTH,
  type FixtureName,
} from './names';
export { createRandom, type FixtureRandom } from './random';
