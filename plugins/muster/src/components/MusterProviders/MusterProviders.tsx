import { ReactNode } from 'react';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { QueryClientProvider } from '../QueryClientProvider';
import { MusterInstanceProvider } from '../MusterInstanceProvider';

/**
 * Shared context every muster tab is mounted inside. With the New Frontend
 * System the muster section is a page with sub-page tabs (see plugin.tsx), so
 * each tab is its own routed element that mounts and unmounts as the user
 * switches tabs. Wrapping every tab in these providers keeps the active
 * installation and muster session consistent across tabs: the QueryClient is a
 * module-level singleton (its cache survives the remount) and the active
 * installation is held in the URL + localStorage, so the remount is a cheap
 * cache read rather than a refetch.
 */
export const MusterProviders = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider>
    <ErrorsProvider>
      <MusterInstanceProvider>{children}</MusterInstanceProvider>
    </ErrorsProvider>
  </QueryClientProvider>
);
