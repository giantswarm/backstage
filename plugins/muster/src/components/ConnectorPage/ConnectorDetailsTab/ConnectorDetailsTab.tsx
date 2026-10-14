import { Flex } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
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

const useStyles = makeStyles({
  // Inset as the Technical details fold-out below insets its title (its 1px
  // border plus bui's accordion padding), so the facts line up with it
  // instead of starting at the content's edge, left of it and of the tabs'
  // labels.
  facts: {
    paddingInline: 'calc(var(--bui-space-3) + 1px)',
  },
});

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
  const classes = useStyles();
  return (
    <Flex direction="column" gap="5">
      {facts.length > 0 && (
        <section aria-label="Connector details" className={classes.facts}>
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
