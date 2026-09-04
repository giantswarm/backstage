import { Badge, Flex, Text } from '@backstage/ui';

const DEFAULT_LIMIT = 8;

interface ValueBadgesProps {
  values: string[];
  /** Truncate beyond this many values; the rest become a "+N more" badge. */
  limit?: number;
}

/**
 * A wrapping row of values. Truncated because a single Karpenter pool can
 * legitimately allow dozens of instance types.
 */
export const ValueBadges = ({
  values,
  limit = DEFAULT_LIMIT,
}: ValueBadgesProps) => {
  if (values.length === 0) {
    return (
      <Text variant="body-medium" color="secondary">
        (none)
      </Text>
    );
  }

  const shown = values.slice(0, limit);
  const hidden = values.length - shown.length;

  return (
    <Flex
      gap="1"
      align="center"
      style={{ flexWrap: 'wrap' }}
      title={values.join(', ')}
    >
      {shown.map(value => (
        <Badge key={value} size="small">
          {value}
        </Badge>
      ))}
      {hidden > 0 && <Badge size="small">{`+${hidden} more`}</Badge>}
    </Flex>
  );
};
