import { Flex, Link, Text } from '@backstage/ui';
import {
  type Fact,
  FactList,
  FoldOutAlignedSection,
  Mono,
  PageSection,
  useFactTextVariant,
} from '@giantswarm/backstage-plugin-ui-react';
import type { ToolAnnotations, ToolDetail } from '../../../apis';
import {
  DetailSkeleton,
  ExplorerError,
  InputSchemaFoldOut,
} from '../../ToolDetail';
import { annotationLines } from './annotationLines';

/** What the connector declares about the tool, a line each, as facts are set. */
function AnnotationLines({ annotations }: { annotations?: ToolAnnotations }) {
  const variant = useFactTextVariant();
  return (
    <Flex direction="column" gap="1">
      {annotationLines(annotations).map(line => (
        <Text key={line} variant={variant}>
          {line}
        </Text>
      ))}
    </Flex>
  );
}

export type ToolOverviewTabProps = {
  /** The tool's name as muster exposes it (`x_kubernetes_list`). */
  name: string;
  installation: string;
  /** The tool as muster describes it, once read. */
  detail?: ToolDetail;
  isLoading: boolean;
  error?: unknown;
  /** Its annotations: the description's, else the Tools list's. */
  annotations?: ToolAnnotations;
  /** The connector that offers it, as people call it. */
  connectorName: string;
  /** The connector's page, its Tools search kept. */
  connectorHref?: string;
};

/**
 * A connector tool's Overview (its page's index): what it is for, then its
 * facts — the connector that offers it, the name muster exposes it as and
 * what its connector declares about it — and its input schema folded away,
 * as the workflow page's Details keeps its technical details.
 */
export function ToolOverviewTab({
  name,
  installation,
  detail,
  isLoading,
  error,
  annotations,
  connectorName,
  connectorHref,
}: ToolOverviewTabProps) {
  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (error) {
    return <ExplorerError error={error} installation={installation} />;
  }

  const facts: Fact[] = [
    {
      label: 'Connector',
      value: connectorHref ? (
        <Link href={connectorHref}>{connectorName}</Link>
      ) : (
        connectorName
      ),
    },
    {
      label: 'Exposed by muster as',
      value: <Mono>{name}</Mono>,
    },
    {
      label: 'Annotations',
      value: <AnnotationLines annotations={annotations} />,
    },
  ];

  return (
    <Flex direction="column" gap="5">
      {/* Headed as the agent, skill and workflow pages head theirs. */}
      <PageSection title="What it’s for">
        {detail?.description ? (
          <Text
            as="p"
            variant="body-medium"
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {detail.description}
          </Text>
        ) : (
          <Text as="p" variant="body-medium" color="secondary">
            Its connector gives no description.
          </Text>
        )}
      </PageSection>
      <FoldOutAlignedSection aria-label="Tool details">
        <FactList facts={facts} labelWidth={160} />
      </FoldOutAlignedSection>
      {detail?.inputSchema && (
        <InputSchemaFoldOut schema={detail.inputSchema} />
      )}
    </Flex>
  );
}
