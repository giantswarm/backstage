import { Flex, Link, Text } from '@backstage/ui';

/** A wildcard has no single address to open, so only concrete names link. */
export const HostnameList = ({
  hostnames,
}: {
  hostnames: string[] | undefined;
}) => {
  if (hostnames === undefined) return <>—</>;
  if (hostnames.length === 0) return <>any</>;
  return (
    <Flex direction="column" gap="1">
      {hostnames.map(hostname =>
        hostname.includes('*') ? (
          <Text key={hostname} variant="body-medium">
            {hostname}
          </Text>
        ) : (
          <Link
            key={hostname}
            href={`https://${hostname}/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {hostname}
          </Link>
        ),
      )}
    </Flex>
  );
};
