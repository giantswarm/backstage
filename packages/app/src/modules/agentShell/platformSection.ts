import { configApiRef, useApiHolder } from '@backstage/core-plugin-api';
import type { FilterPredicate } from '@backstage/filter-predicates';
import { agentShellOn } from './predicates';

/** The config key that turns the shell's Platform section on. */
export const PLATFORM_SECTION_CONFIG_KEY =
  'gs.features.platformSection.enabled';

/**
 * The feature flag the Platform section's extensions key on. It is not
 * registered, so the settings page never lists it: `PortalFeatureFlags`
 * reports it from {@link PLATFORM_SECTION_CONFIG_KEY} alone, because extension
 * predicates can only read feature flags.
 */
export const PLATFORM_SECTION_FLAG = 'platform-section';

/** Whether the deployment turned the Platform section on; off by default. */
export function isPlatformSectionConfigured(config: {
  getOptionalBoolean(key: string): boolean | undefined;
}): boolean {
  return config.getOptionalBoolean(PLATFORM_SECTION_CONFIG_KEY) === true;
}

/**
 * The extension predicate of the Platform section's page: the shell is
 * available and the deployment turned the section on.
 */
export const platformSectionOn: FilterPredicate = {
  $all: [agentShellOn, { featureFlags: { $contains: PLATFORM_SECTION_FLAG } }],
};

/**
 * Whether this deployment turned the Platform section on, for the chrome:
 * `/platform` is in the agent area only then, so with the section off the
 * address renders as it did before the section existed.
 */
export function usePlatformSectionConfigured(): boolean {
  const config = useApiHolder().get(configApiRef);
  return config ? isPlatformSectionConfigured(config) : false;
}
