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
  gsAuthProvidersApiRef,
  type GSAuthProvidersApi,
} from './apis/auth/types';
export {
  useInstallations,
  type InstallationConfig,
  type UseInstallationsResult,
} from './apis/installations';
export { InstallationsConfigLoader } from './components/InstallationsConfigLoader';
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
