import { useMemo } from 'react';
import { useInstallationInventory } from '@giantswarm/backstage-plugin-gs';
import {
  type TagSourceProps,
  useReportTags,
} from '@giantswarm/backstage-plugin-ui-react';

import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { QueryClientProvider } from '../QueryClientProvider';
import { selectMusterInstallations } from '../MusterInstanceProvider/selectInstallations';
import { useMusterInstallations } from '../MusterInstanceProvider/useMusterInstallations';
import { useMusterResources } from '../MusterInstanceProvider/useMusterResources';

/**
 * The tag sources sit in the shell layout, so a mount reads the list on any
 * page. It is the full objects (megabytes for hundreds of workflows) for a
 * few tags each, so a mount reuses what was read for a while; the Connectors
 * and Workflows tabs read the same query with their own freshness.
 */
const TAG_SOURCE_QUERY_OPTIONS = { staleTime: 5 * 60_000 };

/**
 * Every installation the Connectors and Workflows tabs can show, not only the
 * one in scope: one vocabulary for the fleet.
 */
function useMusterTagInstallations(): string[] {
  const { installations } = useMusterInstallations();
  const inventory = useInstallationInventory();
  return useMemo(
    () =>
      selectMusterInstallations(installations, inventory, undefined).map(
        installation => installation.name,
      ),
    [installations, inventory],
  );
}

function ConnectorTags({ onTags }: TagSourceProps) {
  const { resources, isLoading } = useMusterResources(
    useMusterTagInstallations(),
    MCPServer,
    TAG_SOURCE_QUERY_OPTIONS,
  );
  // One entry per connector, as the Connectors tab lists them: a family's
  // servers are one connector on each installation. Only the tags written on
  // the servers, not the read-only one their tool-group label reads as
  // (`connectorTags`), which no form takes.
  const items = useMemo(() => {
    const connectors = new Map<string, Set<string>>();
    for (const server of resources) {
      const key = `${server.cluster}/${server.getFamily() ?? server.getName()}`;
      const tags = connectors.get(key) ?? new Set<string>();
      server.getTags().forEach(tag => tags.add(tag));
      connectors.set(key, tags);
    }
    return [...connectors.values()].map(tags => [...tags]);
  }, [resources]);
  useReportTags(isLoading && items.length === 0 ? undefined : items, onTags);
  return null;
}

/**
 * The connectors' tags on every muster installation, one entry per
 * connector, for a `TagVocabularyProvider`. Read as the Connectors tab reads
 * them, through this plugin's query client, so a list already read is a
 * cache hit.
 */
export function ConnectorTagSource(props: TagSourceProps) {
  return (
    <QueryClientProvider>
      <ConnectorTags {...props} />
    </QueryClientProvider>
  );
}

function WorkflowTags({ onTags }: TagSourceProps) {
  const { resources, isLoading } = useMusterResources(
    useMusterTagInstallations(),
    MusterWorkflow,
    TAG_SOURCE_QUERY_OPTIONS,
  );
  const items = useMemo(
    () => resources.map(workflow => workflow.getTags()),
    [resources],
  );
  useReportTags(isLoading && items.length === 0 ? undefined : items, onTags);
  return null;
}

/**
 * The workflows' tags on every muster installation, for a
 * `TagVocabularyProvider`, read as {@link ConnectorTagSource} reads
 * connectors.
 */
export function WorkflowTagSource(props: TagSourceProps) {
  return (
    <QueryClientProvider>
      <WorkflowTags {...props} />
    </QueryClientProvider>
  );
}
