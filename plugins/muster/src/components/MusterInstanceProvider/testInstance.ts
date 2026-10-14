import { MusterInstance } from './MusterInstanceProvider';

/**
 * A settled single-installation `MusterInstance` on `gazelle` for tests, with
 * no-op callbacks; `overrides` replace any field (a `retry` spy, say).
 */
export function makeTestMusterInstance(
  overrides: Partial<MusterInstance> = {},
): MusterInstance {
  return {
    installations: ['gazelle'],
    isLoadingInstallations: false,
    installationInfos: [],
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: undefined,
    setActiveInstallation: () => {},
    mcpServers: [],
    workflows: [],
    isLoading: false,
    retry: () => {},
    refreshInventory: () => {},
    ...overrides,
  };
}
