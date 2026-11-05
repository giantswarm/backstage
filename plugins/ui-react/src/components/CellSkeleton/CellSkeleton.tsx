import { Skeleton, Text, VisuallyHidden } from '@backstage/ui';

export type CellSkeletonProps = {
  /** Relative widths keep it inside its column at any table width. */
  width: number | string;
  /**
   * The bui `Text` variant of the value it stands in for. Without one, it is
   * one line of the text around it — the cell's own, for a value that is not
   * a `Text`, such as a monospace pin.
   */
  variant?: 'body-medium' | 'body-small' | 'body-x-small';
  /**
   * What is being read, for a screen reader, e.g. "Reading calls…". Without
   * one the placeholder is silent, as in a table whose rows say so already.
   */
  label?: string;
};

/**
 * The placeholder for one value that has not been read yet, in a table cell
 * or a `FactList` value: one line high (`1lh`), so the row keeps its height
 * when the value arrives.
 */
export function CellSkeleton({ width, variant, label }: CellSkeletonProps) {
  const skeleton = (
    <Skeleton
      data-testid="cell-skeleton"
      width={width}
      height="1lh"
      style={{ maxWidth: '100%' }}
      rounded
    />
  );
  const announced = label ? (
    <>
      {skeleton}
      <VisuallyHidden>{label}</VisuallyHidden>
    </>
  ) : (
    skeleton
  );
  // Inside a `Text` of the variant, `1lh` is that variant's line, whatever
  // bui sets it to. A `div`, as the skeleton is: a `span` may not hold one.
  return variant ? (
    <Text as="div" variant={variant}>
      {announced}
    </Text>
  ) : (
    announced
  );
}
