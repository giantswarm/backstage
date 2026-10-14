import { Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  type Fact,
  FactList,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';
import { MusterWorkflow } from '../../../lib/k8s';

const useStyles = makeStyles({
  // Inset as the Technical details fold-out below insets its title (its 1px
  // border plus bui's accordion padding), so the facts line up with it, as on
  // the connector page's Details tab.
  facts: {
    paddingInline: 'calc(var(--bui-space-3) + 1px)',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    wordBreak: 'break-all',
  },
});

/**
 * The Workflow CR's bookkeeping: its namespace and labels and the exact tools
 * muster resolved its steps to. The whole CR is the page menu's manifest.
 */
function WorkflowTechnicalDetails({ workflow }: { workflow: MusterWorkflow }) {
  const classes = useStyles();
  const referencedTools = workflow.getReferencedTools();
  const labels = Object.entries(workflow.getLabels() ?? {});

  return (
    <Flex direction="column" gap="3">
      <Text as="p" variant="body-small" color="secondary">
        Namespace{' '}
        <code className={classes.mono}>{workflow.getNamespace() ?? '—'}</code>
        {labels.length > 0 && (
          <>
            {' · labels '}
            {labels.map(([key, value], index) => (
              <span key={key}>
                {index > 0 && ', '}
                <code className={classes.mono}>
                  {key}={value}
                </code>
              </span>
            ))}
          </>
        )}
      </Text>
      {referencedTools.length > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          Referenced tools:{' '}
          {referencedTools.map((tool, index) => (
            <span key={tool}>
              {index > 0 && ', '}
              <code className={classes.mono}>{tool}</code>
            </span>
          ))}
        </Text>
      )}
    </Flex>
  );
}

export type WorkflowDetailsTabProps = {
  workflow: MusterWorkflow;
  /** The plain facts: where it comes from, how agents call it, its age. */
  facts: Fact[];
};

/**
 * The workflow page's Details tab: the plain facts first, then the CR's
 * bookkeeping in a "Technical details" fold-out, as the agent, model and
 * connector pages keep theirs.
 */
export function WorkflowDetailsTab({
  workflow,
  facts,
}: WorkflowDetailsTabProps) {
  const classes = useStyles();
  return (
    <Flex direction="column" gap="5">
      <section aria-label="Workflow details" className={classes.facts}>
        <FactList facts={facts} labelWidth={160} />
      </section>
      <TechnicalDetailsFoldOut defaultExpanded={false}>
        <WorkflowTechnicalDetails workflow={workflow} />
      </TechnicalDetailsFoldOut>
    </Flex>
  );
}
