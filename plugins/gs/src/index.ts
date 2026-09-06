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
  parseApiGroupList,
  isPlatformComponents,
  NO_PLATFORM_COMPONENTS,
  PLATFORM_API_GROUPS,
  PLATFORM_COMPONENTS,
  type InstallationInventory,
  type InstallationInventoryEntry,
  type InstallationProbeState,
  type PlatformComponent,
  type PlatformComponents,
  type UseHomeInstallationResult,
} from './apis/installationInventory';
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
