import { Alert, Flex, Text } from '@backstage/ui';
import { countNoun } from '@giantswarm/backstage-plugin-ui-react';

import {
  describeObject,
  describeObjects,
  formatClock,
  summarizePass,
  type RemovalPass,
} from '../removalPasses';

export type PassOutcomeProps = {
  passes: RemovalPass[];
  index: number;
  /** The last pass, the removal not complete: what it waits for still holds. */
  current: boolean;
};

/**
 * One pass of the removal: what it removed or otherwise changed, what an
 * earlier pass's delete is still removing, what is left and why, and what it
 * waits for — or, when it changed nothing new, that nothing more could be
 * removed yet.
 */
export function PassOutcome({ passes, index, current }: PassOutcomeProps) {
  const { label, result, at } = passes[index];
  const { removed, stillGoing, others, changed } = summarizePass(passes, index);
  let title = `Removed as you: ${countNoun(removed.length, 'object')}`;
  if (removed.length === 0 && changed.length > 0) {
    title = `Changed as you: ${countNoun(changed.length, 'object')}`;
  } else if (removed.length === 0) {
    title =
      index === 0
        ? 'Nothing could be removed yet'
        : 'Nothing more could be removed yet';
  }
  return (
    <Alert
      status={removed.length > 0 || changed.length > 0 ? 'success' : 'info'}
      data-testid="delete-pass"
      title={title}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small" color="secondary">
            {label}, {formatClock(at)}
          </Text>
          {removed.length > 0 && (
            <Text variant="body-small" color="secondary">
              {removed.map(describeObject).join(' · ')}
            </Text>
          )}
          {others.length > 0 && (
            <Text variant="body-small" color="secondary">
              {others
                .map(object => `${describeObject(object)}: ${object.action}`)
                .join(' · ')}
            </Text>
          )}
          {stillGoing.length > 0 && (
            <Text variant="body-small">
              Still being removed: {describeObjects(stillGoing)}.
            </Text>
          )}
          {(result.warnings ?? []).map(warning => (
            <Text key={warning} variant="body-small">
              {warning}
            </Text>
          ))}
          {current && result.nextStep && (
            <Text variant="body-small">{result.nextStep}</Text>
          )}
        </Flex>
      }
    />
  );
}
