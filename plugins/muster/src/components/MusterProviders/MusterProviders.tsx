import { ReactNode } from 'react';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { QueryClientProvider } from '../QueryClientProvider';
import { MusterInstanceProvider } from '../MusterInstanceProvider';

/**
 * Shared context each of muster's Customize tabs' pages (Connectors,
 * Workflows; see plugin.tsx) is mounted inside. A page mounts and unmounts as
 * the user moves between tabs, and these providers with it. What must survive the
 * switch lives outside them: the QueryClient is a module-level singleton, so
 * the inventory and the muster session are cache reads on remount, and the
 * installation scope is the shared `useInstallationScope` store. The errors
 * panel's list is per mount: an error dismissed on one tab can show again
 * after a switch, as on the other Agent Platform tabs.
 */
export const MusterProviders = ({
  installation,
  children,
}: {
  /** The installation the address names; see `MusterInstanceProvider`. */
  installation?: string;
  children: ReactNode;
}) => (
  <QueryClientProvider>
    <ErrorsProvider>
      <MusterInstanceProvider installation={installation}>
        {children}
      </MusterInstanceProvider>
    </ErrorsProvider>
  </QueryClientProvider>
);
