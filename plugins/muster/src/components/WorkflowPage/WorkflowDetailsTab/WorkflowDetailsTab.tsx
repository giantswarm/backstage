import { Flex } from '@backstage/ui';
import {
  type Fact,
  FactList,
  FoldOutAlignedSection,
  Mono,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';
import { MusterWorkflow } from '../../../lib/k8s';

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
  return (
    <Flex direction="column" gap="5">
      <FoldOutAlignedSection aria-label="Workflow details">
        <FactList facts={facts} labelWidth={160} />
      </FoldOutAlignedSection>
      <TechnicalDetailsFoldOut defaultExpanded={false}>
        <WorkflowTechnicalDetails workflow={workflow} />
      </TechnicalDetailsFoldOut>
    </Flex>
  );
}
