import { Cell, Flex, Text } from '@backstage/ui';

const WRAP = { overflowWrap: 'anywhere' } as const;

/**
 * bui's `CellText`, but its lines wrap instead of ending in an ellipsis: for
 * a cell whose text is a fact a person reads whole (a binding's note, the
 * credentials a connector sends), not a name to scan.
 */
export function WrappingCellText({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Cell>
      <Flex direction="column" gap="0.5">
        <Text as="p" variant="body-medium" style={WRAP}>
          {title}
        </Text>
        {description ? (
          <Text as="p" variant="body-medium" color="secondary" style={WRAP}>
            {description}
          </Text>
        ) : null}
      </Flex>
    </Cell>
  );
}
