import { Skeleton, Text } from '@backstage/ui';

export type CellSkeletonProps = {
  /** Relative widths keep it inside its column at any table width. */
  width: string;
  /**
   * The bui `Text` variant of the value it stands in for. Without one, it is
   * one line of the text around it — the cell's own, for a value that is not
   * a `Text`, such as a monospace pin.
   */
  variant?: 'body-small' | 'body-x-small';
};

/**
 * A table cell's placeholder for a value that has not been read yet: one line
 * high (`1lh`), so the row keeps its height when the value arrives.
 */
export function CellSkeleton({ width, variant }: CellSkeletonProps) {
  const skeleton = (
    <Skeleton
      data-testid="cell-skeleton"
      width={width}
      height="1lh"
      style={{ maxWidth: '100%' }}
      rounded
    />
  );
  // Inside a `Text` of the variant, `1lh` is that variant's line, whatever
  // bui sets it to.
  return variant ? (
    <Text as="div" variant={variant}>
      {skeleton}
    </Text>
  ) : (
    skeleton
  );
}
