import { Flex } from '@backstage/ui';
import {
  type Fact,
  FactList,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer } from '../../../lib/k8s';
import { ServerPageRow } from '../../../lib/serverGrouping';
import {
  ConnectorTechnicalDetails,
  technicalDetailsOpenByDefault,
} from '../ConnectorTechnicalDetails';

export type ConnectorDetailsTabProps = {
  row: ServerPageRow;
  /** What a person using the connector reads: sign-in, health, use, age. */
  facts: Fact[];
  /** The connector's MCPServer, or the instance a family's are read from. */
  representative?: MCPServer;
  installation: string;
};

/**
 * The connector page's Details tab: the plain facts first, then the
 * MCPServer resource in a "Technical details" fold-out, as the agent and
 * model pages keep theirs.
 */
export function ConnectorDetailsTab({
  row,
  facts,
  representative,
  installation,
}: ConnectorDetailsTabProps) {
  return (
    <Flex direction="column" gap="5">
      {facts.length > 0 && (
        <section aria-label="Connector details">
          <FactList facts={facts} labelWidth={160} />
        </section>
      )}
      {representative && (
        <TechnicalDetailsFoldOut
          defaultExpanded={technicalDetailsOpenByDefault(row)}
          followDefaultExpanded
        >
          <ConnectorTechnicalDetails
            server={representative}
            isFamily={row.kind === 'family'}
            installation={installation}
          />
        </TechnicalDetailsFoldOut>
      )}
    </Flex>
  );
}
