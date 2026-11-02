import { AgentsDataProvider } from '../AgentsDataProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { ModelDetailPage } from '../ModelDetailPage';
import { QueryClientProvider } from '../QueryClientProvider';
import { ServingProvider } from '../ServingProvider';

/**
 * One model's page as the app's Customize page routes it
 * (`<customize>/models/<installation>/<namespace>/<name>`): `ModelDetailPage`
 * inside exactly the agent-platform data it reads, the serving snapshot (its
 * status and serving block) and the agents ("Used by", the usage figures'
 * agent names), with the ModelConfigs the agent provider resolves each agent's
 * model through, under the plugin's query client.
 *
 * Not inside the Customize screen's providers: they add the skill catalogue's
 * GitHub reads and muster's polling, which the page never shows, and muster's
 * own `ErrorsProvider`, whose panel would report muster failures above a page
 * about a ModelConfig. The page mounts its one `ErrorsProvider` itself. The
 * query client is the one the list uses, so reads the list made are cache
 * hits here, and the other way round.
 */
export function CustomizeModelPage() {
  return (
    <QueryClientProvider>
      <ModelConfigsProvider>
        <ServingProvider>
          <AgentsDataProvider>
            <ModelDetailPage />
          </AgentsDataProvider>
        </ServingProvider>
      </ModelConfigsProvider>
    </QueryClientProvider>
  );
}
