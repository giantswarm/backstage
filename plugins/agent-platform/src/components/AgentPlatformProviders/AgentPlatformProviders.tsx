import { ReactNode } from 'react';
import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { SessionsDataProvider } from '../SessionsDataProvider';

/**
 * The plugin's query client and fleet-wide data providers, for rendering the
 * plugin's components outside its own pages.
 *
 * The query client is the plugin's module-wide singleton, so a mount here
 * shares its cache with the plugin's pages.
 */
export function AgentPlatformProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider>
      <ModelConfigsProvider>
        <AgentsDataProvider>
          <SessionsDataProvider>{children}</SessionsDataProvider>
        </AgentsDataProvider>
      </ModelConfigsProvider>
    </QueryClientProvider>
  );
}
