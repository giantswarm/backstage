import { Skeleton } from '@backstage/ui';

/**
 * The bui `Text` sizes each variant's line at 140% of its font size; a
 * placeholder takes the line of the text it stands in for, so the row keeps
 * its height when the text arrives.
 */
const LINE_HEIGHT = {
  'body-small': 'calc(var(--bui-font-size-2) * 1.4)',
  'body-x-small': 'calc(var(--bui-font-size-1) * 1.4)',
} as const;

export type CellSkeletonProps = {
  /** Relative widths keep it inside its column at any table width. */
  width: string;
  /** The `Text` variant of the value it stands in for. */
  variant?: keyof typeof LINE_HEIGHT;
};

/** A table cell's placeholder for a value that has not been read yet. */
export function CellSkeleton({
  width,
  variant = 'body-small',
}: CellSkeletonProps) {
  return (
    <Skeleton
      data-testid="cell-skeleton"
      width={width}
      height={LINE_HEIGHT[variant]}
      style={{ maxWidth: '100%' }}
      rounded
    />
  );
}
