import { useMemo } from 'react';
import { Select } from '@backstage/ui';
import type {
  InstallationInventoryEntry,
  PlatformComponent,
} from '../../apis/installationInventory/types';
import {
  ALL_INSTALLATIONS,
  describeInstallationScopeOption,
  useInstallationScope,
  useInstallationScopeUrlSync,
} from '../../apis/installationScope';

export const ALL_INSTALLATIONS_LABEL = 'All installations';

export type InstallationScopeSelectProps = {
  /**
   * The component the current tab reads (kagent for Agents, Sessions and
   * Models; muster for MCP Servers). Installations without it are still
   * offered -- they are platform installations -- but say so.
   */
  component?: PlatformComponent;
  /**
   * Extra state for one installation that only the host knows, e.g. "not
   * reachable from this portal" from a backend's endpoint probe. Rendered
   * before the generic state.
   */
  describe?: (entry: InstallationInventoryEntry) => string | undefined;
  className?: string;
};

/**
 * The selector for the Agent Platform section's installation scope: "All
 * installations" (the default) and every platform installation the inventory
 * knows, home first, each with its state. Choosing pins the scope for every
 * tab; the choice is kept in the URL and in localStorage.
 *
 * Renders nothing on a portal that knows one installation, so the standalone
 * chart and single-installation portals look exactly as before. Mount it once
 * per page: it owns the URL side of the scope (`useInstallationScopeUrlSync`).
 */
export function InstallationScopeSelect({
  component,
  describe,
  className,
}: InstallationScopeSelectProps) {
  useInstallationScopeUrlSync();
  const { scope, setScope, installations, isSingleInstallation, isLoading } =
    useInstallationScope();

  const options = useMemo(
    () => [
      { id: ALL_INSTALLATIONS, label: ALL_INSTALLATIONS_LABEL },
      ...installations.map(entry => {
        const state = [
          describe?.(entry),
          describeInstallationScopeOption(entry, component),
        ].filter((part): part is string => Boolean(part));
        return {
          id: entry.installation,
          label: entry.installation,
          description: state.length > 0 ? state.join(' · ') : undefined,
        };
      }),
    ],
    [installations, describe, component],
  );

  if (isLoading || isSingleInstallation) {
    return null;
  }

  // A pinned installation the inventory does not list (a deep link to a name
  // this portal does not know, or one that turned out to run no platform
  // component) stays selectable, so the control shows what the URL says
  // instead of a blank trigger.
  const known = options.some(option => option.id === scope);
  const allOptions = known
    ? options
    : [...options, { id: scope, label: scope, description: 'not found' }];

  return (
    <Select
      aria-label="Installation scope"
      className={className}
      options={allOptions}
      selectedKey={scope}
      onSelectionChange={key => {
        if (key !== null) {
          setScope(String(key));
        }
      }}
    />
  );
}
