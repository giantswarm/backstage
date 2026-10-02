import { Flex, Skeleton } from '@backstage/ui';

/** Placeholder for a tool's detail while muster describes it. */
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
