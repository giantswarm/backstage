import { ReactNode } from 'react';
import { AllInstallationsScope } from '@giantswarm/backstage-plugin-gs';
import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { SessionsDataProvider } from '../SessionsDataProvider';
import { OrganizationDirectoryProvider } from '../OrganizationDirectoryProvider';

/**
 * The plugin's query client and fleet-wide data providers, for rendering the
 * plugin's components outside its own pages.
 *
 * The query client is the plugin's module-wide singleton, so a mount here
 * shares its cache with the plugin's pages.
 *
 * Reads every environment: the shell's rail and inbox have no Environment
 * selector, so a pin made on a Customize page must not narrow them.
 */
export function AgentPlatformProviders({ children }: { children: ReactNode }) {
  return (
    <AllInstallationsScope>
      <QueryClientProvider>
        <OrganizationDirectoryProvider>
          <ModelConfigsProvider>
            <AgentsDataProvider>
              <SessionsDataProvider>{children}</SessionsDataProvider>
            </AgentsDataProvider>
          </ModelConfigsProvider>
        </OrganizationDirectoryProvider>
      </QueryClientProvider>
    </AllInstallationsScope>
  );
}
