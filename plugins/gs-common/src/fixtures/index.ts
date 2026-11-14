/**
 * The fixture mode's data (docs/fixtures.md): builders and the seeded base
 * data set every fixture handler shares. A subpath of its own
 * (`@giantswarm/backstage-plugin-gs-common/fixtures`) so nothing reaches a
 * production build through the package's main entry; only fixture modules
 * and tests import it. It exports what the fixtures of other packages read.
 */
export {
  AGENT_STATES,
  CONNECTOR_STATES,
  DAY,
  MINUTE,
  type AgentState,
  type ConnectorState,
  type FixtureAgent,
  type FixtureConnector,
  type FixtureExecution,
  type FixtureInstallation,
  type FixtureOrganization,
  type FixtureSession,
  type FixtureToolsetPreset,
  type FixtureWorkflow,
  type OrganizationRole,
} from './builders';
export {
  baseDataSet,
  createFixtureDataSet,
  inInstallation,
  isUnreachableInstallation,
  unreachableInstallationError,
  type FixtureDataSet,
  type FixtureDataSetSettings,
} from './dataSet';
export {
  FIXTURE_PROVIDERS,
  isWorkspaceOrganization,
  type FixtureProvider,
  type FixtureRepository,
  type FixtureRepositoryOwner,
  type FixtureSkill,
  type FixtureSkillRepository,
  type FixtureToolchain,
  type FixtureToolchainSource,
  type FixtureWorkspace,
  type FixtureWorkspaceSource,
} from './managerBuilders';
export {
  CACHE_CLAIM_STATES,
  FIXTURE_ACCELERATORS,
  FIXTURE_OLLAMA_MODELS,
  FIXTURE_SERVING_PRESETS,
  GPU_POOL_STATES,
  HOSTED_MODEL_STATES,
  MODEL_BACKEND_STATES,
  type FixtureCacheClaim,
  type FixtureGpuCluster,
  type FixtureGpuPool,
  type FixtureHostedModel,
  type FixtureModelBackend,
  type FixtureServingPreset,
} from './hostingBuilders';
export { hashOf } from './random';
