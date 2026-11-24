import type { ReactNode } from 'react';
import { Text } from '@backstage/ui';

/**
 * A cell's value with a muted line under it, as the design's sub-lines:
 * both wrap where they must rather than being cut.
 */
export function PlatformCellLines({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** More under the description, such as a row's policy chips. */
  children?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Text
        as="span"
        variant="body-medium"
        style={{ overflowWrap: 'anywhere' }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          as="span"
          variant="body-small"
          color="secondary"
          style={{ overflowWrap: 'anywhere' }}
        >
          {description}
        </Text>
      ) : null}
      {children}
    </div>
  );
}
