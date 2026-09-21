import { CSSProperties } from 'react';
import { Flex, Text } from '@backstage/ui';
import { VerifyFeature, VerifyResult } from '../apis';
import {
  checkedDimensions,
  count,
  differingDimensions,
  differs,
  fileGroups,
  foundWords,
  hasOwnFacts,
  notChecked,
  splitGroups,
} from '../lib/comparison';
import { DimensionItem, LIST_STYLE } from './DimensionItem';
import { FileGroup } from './FileDiff';

const PLANNED_STYLE: CSSProperties = { paddingLeft: 16, marginTop: 4 };

const title = (feature: { id: string; title?: string }) =>
  feature.title ?? feature.id;

/** How a feature's differing dimensions split: checks that differ, to apply, and checks whose change is planned. */
function countsOfFeature(feature: VerifyFeature) {
  const dimensions = differingDimensions(feature);
  const differences = dimensions.filter(d => differs(d.mark)).length;
  return { differences, planned: dimensions.length - differences };
}

/**
 * What the comparison found, one line per fact: each feature with a check
 * that differs; one group per file with a difference to apply, headed by
 * its path and open to its diff with every reason on its line; the
 * features whose changes are all planned, as one line that opens to their
 * files' groups so every planned change is reachable; the dimensions with
 * facts of their own (a reason, a probe, an object); the features as
 * defined, as one line; the checks that did not run, by reason.
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
  const { toApply, planned } = splitGroups(fileGroups(result));
  const facts = features.flatMap(f =>
    differingDimensions(f).filter(hasOwnFacts),
  );
  return (
    <Flex direction="column" gap="1" data-testid="comparison">
      {differing.map(feature => (
        <Text
          key={feature.id}
          variant="body-small"
          data-testid={`feature-${feature.id}`}
        >
          {title(feature)} —{' '}
          {foundWords(countsOfFeature(feature), 'check').join(' · ')}
        </Text>
      ))}
      {toApply.map(group => (
        <FileGroup key={group.file} group={group} />
      ))}
      {plannedOnly.length > 0 ? (
        <details data-testid="planned">
          <summary>
            <Text as="span" variant="body-small" color="secondary">
              {plannedOnly.map(title).join(', ')}:{' '}
              {foundWords({ differences: 0, planned: plannedCount }, 'check')}
            </Text>
          </summary>
          <Flex direction="column" gap="1" style={PLANNED_STYLE}>
            {planned.map(group => (
              <FileGroup key={group.file} group={group} />
            ))}
          </Flex>
        </details>
      ) : (
        planned.map(group => <FileGroup key={group.file} group={group} />)
      )}
      {facts.length > 0 && (
        <ul style={LIST_STYLE} data-testid="dimension-facts">
          {facts.map(dimension => (
            <DimensionItem key={dimension.id} dimension={dimension} />
          ))}
        </ul>
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
