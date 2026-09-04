import { Flex, Text } from '@backstage/ui';
import { type RequirementEntry } from '../karpenter';
import { ValueBadges } from './ValueBadges';

/**
 * Wording per polarity. Exclusions are spelled out rather than distinguished
 * by colour alone, so an inversion of meaning cannot be lost visually.
 */
const POLARITY_PREFIX: Record<string, string> = {
  allow: 'Any of',
  deny: 'Excluded',
  require: 'Required',
  forbid: 'Must not be set',
  min: 'Greater than',
  max: 'Less than',
};

interface ConstraintValuesProps {
  entry: RequirementEntry;
}

/**
 * All constraints on one key. Karpenter intersects them, so they are rendered
 * as a stack of conditions that all hold, never as alternatives.
 */
export const ConstraintValues = ({ entry }: ConstraintValuesProps) => {
  return (
    <Flex direction="column" gap="1">
      {entry.constraints.map((constraint, index) => {
        const prefix =
          constraint.polarity === 'unknown'
            ? constraint.rawOperator
            : POLARITY_PREFIX[constraint.polarity];

        const suffix = entry.unit ? ` ${entry.unit}` : '';

        // Operators that carry no values are fully described by their wording.
        if (
          constraint.polarity === 'require' ||
          constraint.polarity === 'forbid'
        ) {
          return (
            <Text key={index} variant="body-medium">
              {constraint.polarity === 'require'
                ? 'Required (any value)'
                : 'Must not be set'}
            </Text>
          );
        }

        if (constraint.polarity === 'min' || constraint.polarity === 'max') {
          const symbol = constraint.polarity === 'min' ? '>' : '<';
          return (
            <Text key={index} variant="body-medium">
              {`${symbol} ${constraint.values.join(', ')}${suffix}`}
            </Text>
          );
        }

        return (
          <Flex key={index} direction="column" gap="0.5">
            <Text variant="body-small" color="secondary">
              {prefix}
              {constraint.minValues !== undefined
                ? ` (at least ${constraint.minValues} distinct values)`
                : ''}
            </Text>
            <ValueBadges values={constraint.values} />
          </Flex>
        );
      })}
    </Flex>
  );
};
