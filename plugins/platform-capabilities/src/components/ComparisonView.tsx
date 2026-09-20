import { Flex, Text } from '@backstage/ui';
import { VerifyResult } from '../apis';
import { count, differingDimensions, notChecked } from '../lib/comparison';
import { DimensionItem, LIST_STYLE } from './DimensionItem';

const title = (feature: { id: string; title?: string }) =>
  feature.title ?? feature.id;

/**
 * What the comparison found, one line per fact: each feature with
 * differences, opening to the dimensions that differ; the features without
 * any, as one line; the checks that did not run, by reason.
 */
export function ComparisonView({ result }: { result: VerifyResult }) {
  const features = result.features ?? [];
  const differing = features.filter(f => differingDimensions(f).length > 0);
  const asDefined = features.filter(f => differingDimensions(f).length === 0);
  const pending = notChecked(features);
  return (
    <Flex direction="column" gap="1" data-testid="comparison">
      {differing.map(feature => {
        const dimensions = differingDimensions(feature);
        return (
          <details key={feature.id} data-testid={`feature-${feature.id}`}>
            <summary>
              <Text as="span" variant="body-small">
                {title(feature)} — {count(dimensions.length, 'difference')}
              </Text>
            </summary>
            <ul style={LIST_STYLE}>
              {dimensions.map(dimension => (
                <DimensionItem key={dimension.id} dimension={dimension} />
              ))}
            </ul>
          </details>
        );
      })}
      {asDefined.length > 0 && (
        <Text variant="body-small" color="secondary" data-testid="as-defined">
          {asDefined.map(title).join(', ')}: as defined
        </Text>
      )}
      {pending.session > 0 && (
        <Text
          variant="body-small"
          color="secondary"
          data-testid="needs-session"
        >
          {pending.session === 1
            ? '1 check needs'
            : `${pending.session} checks need`}{' '}
          your session on {result.installation}
        </Text>
      )}
      {pending.other.map(([reason, n]) => (
        <Text
          key={reason}
          variant="body-small"
          color="secondary"
          data-testid="not-run"
        >
          {count(n, 'check')} could not run: {reason}
        </Text>
      ))}
    </Flex>
  );
}
