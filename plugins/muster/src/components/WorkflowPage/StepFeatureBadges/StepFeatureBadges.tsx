import { featureLabels, FlowStepNode } from '../../../lib/workflowGraph';
import { MarkerBadge } from '../../shared';

/**
 * What a step does with its result, as compact markers: it follows the
 * tool's pages ("Paginated, up to 100 pages"), or a jq program reshapes it
 * ("jq transform"). Nothing for a step that does neither. The same markers on
 * the flow canvas and in its phone list.
 */
export function StepFeatureBadges({
  node,
  className,
}: {
  node: Pick<FlowStepNode, 'paginate' | 'jq'>;
  className?: string;
}) {
  const labels = featureLabels(node);
  if (labels.length === 0) {
    return null;
  }
  return (
    <span className={className} data-testid="step-feature-badges">
      {labels.map(label => (
        <MarkerBadge key={label} tone="neutral" size="compact">
          {label}
        </MarkerBadge>
      ))}
    </span>
  );
}
