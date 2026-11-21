import { Flex, Text } from '@backstage/ui';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

/**
 * One hostname per line, cut with an ellipsis when the column is narrower,
 * the whole name on hover.
 */
const line = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** Keeps a link from stretching across the column's width. */
const linkBox = {
  display: 'flex',
  alignSelf: 'flex-start',
  maxWidth: '100%',
  minWidth: 0,
} as const;

/** A wildcard has no single address to open, so only concrete names link. */
export const HostnameList = ({
  hostnames,
}: {
  hostnames: string[] | undefined;
}) => {
  if (hostnames === undefined) return <>—</>;
  if (hostnames.length === 0) return <>any</>;
  return (
    <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
      {hostnames.map(hostname =>
        hostname.includes('*') ? (
          <Text
            key={hostname}
            variant="body-medium"
            style={line}
            title={hostname}
          >
            {hostname}
          </Text>
        ) : (
          // The link is as wide as its name, at most the cell's width; the
          // name inside it is cut, so the link itself is never cut off.
          <div key={hostname} style={linkBox}>
            <ExternalLink
              href={`https://${hostname}/`}
              variant="body-medium"
              display="flex"
            >
              <span style={line} title={hostname}>
                {hostname}
              </span>
            </ExternalLink>
          </div>
        ),
      )}
    </Flex>
  );
};
