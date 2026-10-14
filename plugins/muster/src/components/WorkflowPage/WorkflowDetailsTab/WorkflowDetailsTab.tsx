import { Flex } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  type Fact,
  FactList,
  Mono,
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
});

/** Identifiers one per line, each as someone would retype it. */
function MonoLines({ values }: { values: string[] }) {
  return (
    <Flex direction="column" gap="1">
      {values.map(value => (
        <Mono key={value}>{value}</Mono>
      ))}
    </Flex>
  );
}

/**
 * The Workflow CR's bookkeeping, a fact per row as the tab's plain facts
 * above: its namespace and labels and the exact tools muster resolved its
 * steps to. The whole CR is the page menu's manifest.
 */
function WorkflowTechnicalDetails({ workflow }: { workflow: MusterWorkflow }) {
  const referencedTools = workflow.getReferencedTools();
  const labels = Object.entries(workflow.getLabels() ?? {});

  const facts: Fact[] = [
    {
      label: 'Namespace',
      value: <Mono>{workflow.getNamespace() ?? '—'}</Mono>,
    },
  ];
  if (labels.length > 0) {
    facts.push({
      label: 'Labels',
      value: (
        <MonoLines values={labels.map(([key, value]) => `${key}=${value}`)} />
      ),
    });
  }
  if (referencedTools.length > 0) {
    facts.push({
      label: 'Referenced tools',
      value: <MonoLines values={referencedTools} />,
    });
  }
  return <FactList facts={facts} labelWidth={160} maxWidth={null} />;
}

export type WorkflowDetailsTabProps = {
  workflow: MusterWorkflow;
  /** The plain facts: where it comes from and how agents call it. */
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
