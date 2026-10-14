import { Text } from '@backstage/ui';
import {
  ALL_INSTALLATIONS,
  PLATFORM_COMPONENT_LABELS,
  useInstallationInventory,
  useInstallationScope,
  type PlatformComponent,
} from '@giantswarm/backstage-plugin-gs';

export type InstallationScopeNoteProps = {
  /**
   * The component the tab reads (kagent for the agent-platform tabs). Left
   * out where no one component stands for what the tab reads (Model hosting:
   * KServe, model-manager, cluster-manager); the note then names only an
   * environment the portal does not know.
   */
  component?: PlatformComponent;
};

/**
 * The pinned installation, when the portal knows no installation by that
 * name (a stale deep link); undefined under "All installations", while the
 * installations config is read, and for a known one. A page whose views read
 * nothing there lets `InstallationScopeNote` stand alone instead of an empty
 * state that would say something else about the same state.
 */
export function useUnknownScopePin(): string | undefined {
  const { scope, isLoading } = useInstallationScope();
  const { entries } = useInstallationInventory();
  if (scope === ALL_INSTALLATIONS || isLoading) {
    return undefined;
  }
  return entries.some(entry => entry.installation === scope)
    ? undefined
    : scope;
}

/**
 * Under a pinned scope, the one line that explains an empty tab: the pinned
 * installation does not run the component this tab reads, or the portal does
 * not know an installation by that name (a stale deep link). Renders nothing
 * under "All installations", while the installation's probe is pending, and
 * whenever the installation runs the component -- the table speaks then.
 */
export function InstallationScopeNote({
  component,
}: InstallationScopeNoteProps) {
  const { scope, isLoading } = useInstallationScope();
  const { entries } = useInstallationInventory();

  if (scope === ALL_INSTALLATIONS || isLoading) {
    return null;
  }

  const entry = entries.find(candidate => candidate.installation === scope);
  if (!entry) {
    return (
      <Text variant="body-small" color="secondary">
        This portal knows no environment named “{scope}”.
      </Text>
    );
  }
  if (component && entry.probe === 'answered' && !entry.components[component]) {
    return (
      <Text variant="body-small" color="secondary">
        {PLATFORM_COMPONENT_LABELS[component]} is not installed on {scope}.
      </Text>
    );
  }
  return null;
}
