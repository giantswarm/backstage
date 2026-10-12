import { Flex, Link, Text } from '@backstage/ui';
import LinkIcon from '@material-ui/icons/Link';

import { useReachCatalogue } from '../../hooks/useReachCatalogue';
import { type DeclaredToolset, toolsetShape } from '../../lib/toolset';
import { describeReach, reachNeedsCatalogue } from '../../lib/toolsetReach';

export type AgentReachLineProps = {
  toolset?: DeclaredToolset;
  /** Where the agent runs, to read the catalogue its picked tools belong to. */
  installation?: string;
  /** The agent's own tools view, linked after the sentence when there is one. */
  toolsHref?: string;
};

/**
 * One line under the composer on what the chosen agent can reach, by
 * connector, with a link to its tools; the tool ids themselves are on that
 * page.
 */
export function AgentReachLine({
  toolset,
  installation,
  toolsHref,
}: AgentReachLineProps) {
  const groups = useReachCatalogue(installation, reachNeedsCatalogue(toolset));
  const reach = describeReach(toolset, groups);
  if (!reach) {
    return null;
  }
  // An agent without tools has nothing to see there.
  const hasTools =
    toolset?.state === 'implicit-full' ||
    (toolset?.state === 'declared' &&
      toolsetShape(toolset.selectors) !== 'none');
  return (
    <Flex justify="center" align="center" gap="1">
      <LinkIcon fontSize="small" color="disabled" aria-hidden />
      {/* The link sits in the sentence's line, so both wrap together at
          phone width. */}
      <Text variant="body-small" color="secondary">
        {reach}
        {toolsHref && hasTools && (
          <>
            {' '}
            <Link href={toolsHref} variant="body-small">
              See which tools
            </Link>
          </>
        )}
      </Text>
    </Flex>
  );
}
