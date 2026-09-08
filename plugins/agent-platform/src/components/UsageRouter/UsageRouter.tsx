import { ReactNode } from 'react';
import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { UsagePage } from '../UsagePage';

/**
 * The Usage tab's content: providers, then the page. No `<Routes>` — the tab has
 * no sub-routes, unlike the other three.
 *
 * `AgentsDataProvider` (which needs `ModelConfigsProvider` above it) is mounted
 * so the by-agent table can turn a session's `agent_id` into a display name and
 * a link, the same join `toSessionRow` does for the sessions list. Those lists
 * are cached, persisted and shared with the Agents and Sessions tabs, so after
 * any visit to the section they cost nothing; on a cold deep link the table
 * renders immediately with decoded ids and the names sharpen when the CRs land.
 */
export const UsageRouter = ({ sections }: { sections?: ReactNode }) => (
  <QueryClientProvider>
    <ModelConfigsProvider>
      <AgentsDataProvider>
        <UsagePage sections={sections} />
      </AgentsDataProvider>
    </ModelConfigsProvider>
  </QueryClientProvider>
);
