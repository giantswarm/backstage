import { ModelDetailPage } from '../ModelDetailPage';
import { QueryClientProvider } from '../QueryClientProvider';
import { ServingProvider } from '../ServingProvider';

/**
 * One model's page as the app's Customize page routes it
 * (`<customize>/models/<installation>/<namespace>/<name>`): `ModelDetailPage`
 * inside only the providers it reads, the plugin's query client and the
 * serving snapshot. Not inside the Customize screen's providers, which read
 * every agent, the skill catalogue and muster for the tabs.
 */
export function CustomizeModelPage() {
  return (
    <QueryClientProvider>
      <ServingProvider>
        <ModelDetailPage />
      </ServingProvider>
    </QueryClientProvider>
  );
}
