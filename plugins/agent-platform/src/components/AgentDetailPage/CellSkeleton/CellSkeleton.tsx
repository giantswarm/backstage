import { Skeleton } from '@backstage/ui';

export type CellSkeletonProps = {
  /** Relative widths keep it inside its column at any table width. */
  width: string;
};

/** A table cell's placeholder for a value that has not been read yet. */
export function CellSkeleton({ width }: CellSkeletonProps) {
  return (
    <Skeleton
      data-testid="cell-skeleton"
      width={width}
      height="1rem"
      style={{ maxWidth: '100%' }}
      rounded
    />
  );
}
