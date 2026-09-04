import { Flex, Text } from '@backstage/ui';
import { type RequirementEntry } from '../karpenter';
import { ChipRow } from './ChipRow';

interface AllowedCellProps {
  /** `undefined` means the key carries no requirement at all. */
  entry: RequirementEntry | undefined;
}

/**
 * What a single constraint key permits.
 *
 * An absent key is Karpenter-unconstrained, which must read as "Any" rather
 * than as blank. Exclusions are rendered as exclusions — prefixed with
 * "any except" — because collapsing them into the inclusion styling inverts
 * what the pool is allowed to do.
 */
export const AllowedCell = ({ entry }: AllowedCellProps) => {
  if (!entry) {
    return (
      <Text variant="body-small" color="secondary">
        Any
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="1">
      {entry.constraints.map((constraint, index) => {
        const unit = entry.unit ? ` ${entry.unit}` : '';

        switch (constraint.polarity) {
          case 'allow':
            return constraint.values.length === 0 ? (
              <Text key={index} variant="body-small" color="secondary">
                (no values)
              </Text>
            ) : (
              <ChipRow key={index} values={constraint.values} />
            );

          case 'deny':
            return (
              <Flex key={index} align="center" gap="1">
                <Text variant="body-small" color="secondary">
                  any except
                </Text>
                <ChipRow values={constraint.values} variant="exclude" />
              </Flex>
            );

          case 'require':
            return (
              <Text key={index} variant="body-small">
                Must be set
              </Text>
            );

          case 'forbid':
            return (
              <Text key={index} variant="body-small">
                Must not be set
              </Text>
            );

          case 'min':
          case 'max':
            return (
              <Text key={index} variant="body-small">
                {`${constraint.polarity === 'min' ? '>' : '<'} ${constraint.values.join(', ')}${unit}`}
              </Text>
            );

          default:
            // An operator we don't recognise is shown verbatim rather than
            // dropped, so a new Karpenter operator can't silently make a pool
            // look less constrained than it is.
            return (
              <Flex key={index} align="center" gap="1">
                <Text variant="body-small" color="secondary">
                  {constraint.rawOperator}
                </Text>
                <ChipRow values={constraint.values} />
              </Flex>
            );
        }
      })}
      {entry.constraints.some(c => c.minValues !== undefined) && (
        <Text variant="body-small" color="secondary">
          {`at least ${entry.constraints.find(c => c.minValues !== undefined)?.minValues} distinct`}
        </Text>
      )}
    </Flex>
  );
};
