import { useCallback } from 'react';
import {
  InstallationScopeSelect,
  type InstallationInventoryEntry,
  type PlatformComponent,
} from '@giantswarm/backstage-plugin-gs';
import { useMusterInstallations } from '@giantswarm/backstage-plugin-muster';
import { useKagentInstallations } from '../../hooks/useKagentInstallations';

export type EnvironmentSelectProps = {
  /** The component the current view reads, for each option's remark. */
  component?: PlatformComponent;
};

const NOT_REACHABLE = 'not reachable from this portal';

/**
 * The shell's Environment control: the section's installation scope, under
 * the shell's name for an installation. Renders nothing on a portal that
 * knows one installation.
 */
export function EnvironmentSelect({ component }: EnvironmentSelectProps) {
  const { isNotReachable: kagentNotReachable } = useKagentInstallations();
  const { isNotReachable: musterNotReachable } = useMusterInstallations();
  const describe = useCallback(
    (entry: InstallationInventoryEntry) =>
      (component === 'kagent' && kagentNotReachable(entry.installation)) ||
      (component === 'muster' && musterNotReachable(entry.installation))
        ? NOT_REACHABLE
        : undefined,
    [component, kagentNotReachable, musterNotReachable],
  );

  return (
    <div style={{ minWidth: 200 }}>
      <InstallationScopeSelect
        label="Environment"
        component={component}
        describe={describe}
      />
    </div>
  );
}
