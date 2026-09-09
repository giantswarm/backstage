// NFS plugin (default + named)
export { gsPlugin as default } from './plugin';
export { gsPlugin } from './plugin';

// Raw StepLayout component for scaffolder page override
export { StepLayout } from './components/scaffolder/StepLayout/StepLayout';
export { ReviewStep } from './components/scaffolder/ReviewStep';

export { DiscoveryApiClient as GSDiscoveryApiClient } from './apis/discovery/DiscoveryApiClient';
export { ScaffolderApiClient as GSScaffolderApiClient } from './apis/scaffolder/ScaffolderApiClient';
export {
  gsAuthApiRef,
  gsFallbackSignInAuthApiRef,
  gsAuthProvidersApiRef,
  type GSAuthProvidersApi,
} from './apis/auth/types';
export {
  LocalStorageSignInConnectorMemory,
  SIGN_IN_CONNECTOR_STORAGE_KEY,
  type SignInConnectorMemory,
} from './apis/auth/signInConnectorMemory';
export {
  useInstallations,
  type InstallationConfig,
  type UseInstallationsResult,
} from './apis/installations';
export { InstallationsConfigLoader } from './components/InstallationsConfigLoader';
// One inventory of the Agent Platform components per installation (one
// `GET /apis` each, home first), consumed by the agent-platform and muster
// plugins to decide which installations to query.
export {
  useInstallationInventory,
  useHomeInstallation,
  findHomeInstallation,
  installationInventoryQueryKey,
  INSTALLATION_INVENTORY_QUERY_KEY_PREFIX,
  INSTALLATION_INVENTORY_STALE_TIME_MS,
  INVENTORY_PROBE_PATH,
  InventoryProbeError,
  isInventoryAuthError,
  parseApiGroupList,
  isPlatformComponents,
  NO_PLATFORM_COMPONENTS,
  PLATFORM_API_GROUPS,
  PLATFORM_COMPONENTS,
  classifyInventoryFailure,
  inventoryFailureCopy,
  selectInventoryFailure,
  type InstallationInventory,
  type InstallationInventoryEntry,
  type InstallationProbeState,
  type InventoryFailure,
  type InventoryFailureCopy,
  type InventoryFailureKind,
  type PlatformComponent,
  type PlatformComponents,
  type SelectInventoryFailureOptions,
  type UseHomeInstallationResult,
} from './apis/installationInventory';
// The gate a section renders when the installation it would read could not
// be asked which platform components it runs (a rejected token, a refused
// read): names the installation, quotes the reason, offers the remedy.
export {
  InventoryFailureGate,
  type InventoryFailureGateProps,
} from './components/InventoryFailureGate';
export {
  InstallationInventoryGate,
  type InstallationInventoryGateProps,
} from './components/InstallationInventoryGate';
// The Agent Platform section's one installation scope (`'all'` or a pinned
// installation), read by the agent-platform tabs and the muster section
// alike. A module store, not a React context: the two plugins share a page
// but not a provider tree.
export {
  useInstallationScope,
  useInstallationScopeUrlSync,
  applyInstallationScope,
  describeInstallationScopeOption,
  isPlatformInstallation,
  selectPlatformInstallations,
  setInstallationScope,
  getInstallationScopeSnapshot,
  subscribeInstallationScope,
  readStoredInstallationScope,
  ALL_INSTALLATIONS,
  INSTALLATION_SCOPE_SEARCH_PARAM,
  INSTALLATION_SCOPE_STORAGE_KEY,
  PLATFORM_COMPONENT_LABELS,
  PLATFORM_SCOPE_COMPONENTS,
  __resetInstallationScopeForTests,
  type InstallationScope,
  type InstallationScopeState,
  type UseInstallationScopeResult,
} from './apis/installationScope';
export {
  InstallationScopeSelect,
  ALL_INSTALLATIONS_LABEL,
  type InstallationScopeSelectProps,
} from './components/InstallationScopeSelect';
export {
  clusterAccessStatusApiRef,
  type ClusterAccessStatusApi,
  type ClusterAccessStatusEntry,
  type ClusterAccessState,
} from './apis/clusterAccessStatus';
export {
  mutedInstallationsApiRef,
  type MutedInstallationsApi,
} from './apis/mutedInstallations';
export {
  ClusterAccessStatusSidebarItem,
  ClusterAccessConnector,
} from './components/ClusterAccessStatus';
export { KubernetesClient } from './apis/kubernetes/KubernetesClient';
export { createCustomEntityPresentationRenderer as createGSEntityPresentationRenderer } from './apis/entityPresentation';
export { CustomCatalogPage as GSCustomCatalogPage } from './components/catalog/CustomCatalogPage';
export { ResourcesCard as GSHomePageResources } from './components/home/ResourcesCard';
export { ProviderSettings as GSProviderSettings } from './components/ProviderSettings';
export { useDisabledInstallations } from './components/hooks/useDisabledInstallations';
// Helm chart OCI resolution (tags + default values from the values-schema
// annotation), reused by the agent-platform create flow.
export { useHelmChartTags } from './components/hooks/useHelmChartTags';
export { useHelmChartValuesYaml } from './components/hooks/useHelmChartValuesYaml';
