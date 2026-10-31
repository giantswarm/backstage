import { useMemo } from 'react';
import { useInstallationInventory } from '@giantswarm/backstage-plugin-gs';
import {
  type TagSourceProps,
  useReportTags,
} from '@giantswarm/backstage-plugin-ui-react';

import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { connectorTags } from '../../lib/connectorTags';
import { QueryClientProvider } from '../QueryClientProvider';
import { selectMusterInstallations } from '../MusterInstanceProvider/selectInstallations';
import { useMusterInstallations } from '../MusterInstanceProvider/useMusterInstallations';
import { useMusterResources } from '../MusterInstanceProvider/useMusterResources';

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
  );
  // One entry per connector, as the Connectors tab lists them: a family's
  // servers are one connector on each installation.
  const items = useMemo(() => {
    const connectors = new Map<string, MCPServer[]>();
    for (const server of resources) {
      const key = `${server.cluster}/${server.getFamily() ?? server.getName()}`;
      connectors.set(key, [...(connectors.get(key) ?? []), server]);
    }
    return [...connectors.values()].map(connectorTags);
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
