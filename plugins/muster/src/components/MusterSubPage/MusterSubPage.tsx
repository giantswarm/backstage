import { ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { InventoryFailureGate } from '@giantswarm/backstage-plugin-gs';
import { MusterProviders } from '../MusterProviders';
import { useMusterInstance } from '../MusterInstanceProvider';

/**
 * The tab's body -- or, when there is no installation to show because the one
 * it would show could not be asked whether it runs muster, the gate that says
 * so: which installation, what the API server answered and what fixes it.
 * Without it a rejected token left the tab without an installation and
 * claiming no installation runs muster.
 */
function InventoryGate({
  context,
  children,
}: {
  context: string;
  children: ReactNode;
}) {
  const {
    activeInstallation,
    isLoadingInstallations,
    inventoryFailure,
    refreshInventory,
  } = useMusterInstance();

  if (!isLoadingInstallations && !activeInstallation && inventoryFailure) {
    return (
      <Content>
        <InventoryFailureGate
          failure={inventoryFailure}
          onRetry={refreshInventory}
          context={context}
        />
      </Content>
    );
  }
  return <>{children}</>;
}

export interface MusterSubPageProps {
  /** What the tab reads through the installation's Kubernetes API, for the gate. */
  context: string;
  children: ReactNode;
}

/**
 * One of muster's Agent Platform tabs (MCP Servers, Workflows): the muster
 * providers around the tab's router. Each tab mounts its own providers; the
 * query client is module-level and the installation scope a shared store, so
 * switching between the tabs is a cache read, not a reconnect.
 */
export function MusterSubPage({ context, children }: MusterSubPageProps) {
  return (
    <MusterProviders>
      <InventoryGate context={context}>{children}</InventoryGate>
    </MusterProviders>
  );
}
