import { Flex, Text } from '@backstage/ui';
import { VerifyFeature, VerifyResult } from '../apis';
import {
  checkedDimensions,
  count,
  differingDimensions,
  differs,
  foundWords,
  notChecked,
} from '../lib/comparison';
import { DimensionItem, LIST_STYLE } from './DimensionItem';

const title = (feature: { id: string; title?: string }) =>
  feature.title ?? feature.id;

/** How a feature's differing dimensions split: differences to apply and planned changes. */
function countsOfFeature(feature: VerifyFeature) {
  const dimensions = differingDimensions(feature);
  const differences = dimensions.filter(d => differs(d.mark)).length;
  return { differences, planned: dimensions.length - differences };
}

/**
 * What the comparison found, one line per fact: each feature with
 * differences, opening to the dimensions that differ; the features whose
 * changes are all planned, as one line; the features as defined, as one
 * line; the checks that did not run, by reason.
 */
export function ComparisonView({ result }: { result: VerifyResult }) {
  const features = result.features ?? [];
  const differing = features.filter(f => countsOfFeature(f).differences > 0);
  const plannedOnly = features.filter(f => {
    const counts = countsOfFeature(f);
    return counts.differences === 0 && counts.planned > 0;
  });
  const plannedCount = plannedOnly.reduce(
    (n, f) => n + countsOfFeature(f).planned,
    0,
  );
  const asDefined = features.filter(
    f => differingDimensions(f).length === 0 && checkedDimensions(f).length > 0,
  );
  const pending = notChecked(features);
  return (
    <Flex direction="column" gap="1" data-testid="comparison">
      {differing.map(feature => (
        <details key={feature.id} data-testid={`feature-${feature.id}`}>
          <summary>
            <Text as="span" variant="body-small">
              {title(feature)} —{' '}
              {foundWords(countsOfFeature(feature)).join(' · ')}
            </Text>
          </summary>
          <ul style={LIST_STYLE}>
            {differingDimensions(feature).map(dimension => (
              <DimensionItem key={dimension.id} dimension={dimension} />
            ))}
          </ul>
        </details>
      ))}
      {plannedOnly.length > 0 && (
        <Text variant="body-small" color="secondary" data-testid="planned">
          {plannedOnly.map(title).join(', ')}: planned changes ({plannedCount})
        </Text>
      )}
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
