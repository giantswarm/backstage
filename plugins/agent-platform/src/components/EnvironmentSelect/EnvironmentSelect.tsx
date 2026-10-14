import { useCallback } from 'react';
import {
  InstallationScopeSelect,
  useInstallationScope,
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

type ScopeSelectProps = {
  component?: PlatformComponent;
  describe?: (entry: InstallationInventoryEntry) => string | undefined;
};

function ScopeSelect({ component, describe }: ScopeSelectProps) {
  return (
    <InstallationScopeSelect
      label="Environment"
      component={component}
      describe={describe}
      searchable
    />
  );
}

/**
 * On a kagent view: the installations whose kagent the portal cannot reach
 * say so (the kagent backend's endpoint probe).
 */
function KagentScopeSelect() {
  const { isNotReachable } = useKagentInstallations();
  const describe = useCallback(
    (entry: InstallationInventoryEntry) =>
      isNotReachable(entry.installation) ? NOT_REACHABLE : undefined,
    [isNotReachable],
  );
  return <ScopeSelect component="kagent" describe={describe} />;
}

/** As `KagentScopeSelect`, for muster through the muster backend's probe. */
function MusterScopeSelect() {
  const { isNotReachable } = useMusterInstallations();
  const describe = useCallback(
    (entry: InstallationInventoryEntry) =>
      isNotReachable(entry.installation) ? NOT_REACHABLE : undefined,
    [isNotReachable],
  );
  return <ScopeSelect component="muster" describe={describe} />;
}

/**
 * The shell's Environment control: the section's installation scope, under
 * the shell's name for an installation.
 *
 * Renders nothing — not even its slot — while the installations config is
 * read and on a portal that knows one installation (decision O5), so every
 * header that mounts it needs no gate of its own.
 *
 * Only a kagent or muster view asks that backend which installations it
 * cannot reach; any other view (Model hosting, Skills) starts neither query.
 */
export function EnvironmentSelect({ component }: EnvironmentSelectProps) {
  const { isSingleInstallation, isLoading } = useInstallationScope();
  if (isLoading || isSingleInstallation) {
    return null;
  }

  let select: JSX.Element;
  if (component === 'kagent') {
    select = <KagentScopeSelect />;
  } else if (component === 'muster') {
    select = <MusterScopeSelect />;
  } else {
    select = <ScopeSelect component={component} />;
  }
  return <div style={{ minWidth: 200 }}>{select}</div>;
}
