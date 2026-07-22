import { Flex, Skeleton } from '@backstage/ui';

/** Placeholder rows for the browse/search list while tools load. */
export function BrowserSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Flex direction="column" gap="3">
      {Array.from({ length: rows }).map((_, i) => (
        <Flex key={i} direction="column" gap="1">
          <Skeleton width="60%" height={20} />
          <Skeleton width="85%" height={16} />
        </Flex>
      ))}
    </Flex>
  );
}

/** Placeholder for the tool detail panel while `describe_tool` loads. */
export function DetailSkeleton() {
  return (
    <Flex direction="column" gap="2">
      <Skeleton width="40%" height={32} />
      <Skeleton width="90%" height={18} />
      <Flex direction="column" gap="2" mt="2">
        <Skeleton width="25%" height={20} />
        <Skeleton width="100%" height={44} />
        <Skeleton width="100%" height={44} />
      </Flex>
      <Skeleton width={120} height={36} />
    </Flex>
  );
}
