import { Flex, Text } from '@backstage/ui';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import { SessionRow } from '../SessionsDataProvider/helpers';
import { AgentAvatar } from '../AgentAvatar';

/** The avatar is one line of text tall; request 2× for hi-dpi crispness. */
const ROW_AVATAR_SIZE: AvatarSize = 48;

/**
 * The mark on a session whose runtime kagent reports lost: the same two words
 * on the list, the rail and the page's header, so one session reads the same
 * everywhere.
 */
export const RUNTIME_LOST_LABEL = 'Runtime lost';
export const RUNTIME_LOST_TITLE =
  'kagent cannot bring this session’s agent back; the transcript stays readable. Start a new session to carry on.';

/** One line, cut with an ellipsis at the width of its container. */
export const TRUNCATE = {
  display: 'block',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** Dash shown where a value is genuinely unknown. */
export function Unknown() {
  return (
    <Text variant="body-medium" color="secondary">
      —
    </Text>
  );
}

/** A row's agent: its avatar and display name, or a dash when unknown. */
export function SessionAgent({
  row,
  buildAvatarUrl,
}: {
  row: SessionRow;
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>;
}) {
  if (!row.agentName) {
    return <Unknown />;
  }
  return (
    <Flex align="center" gap="2">
      <AgentAvatar
        size="small"
        purpose="decoration"
        name={row.agentName}
        src={
          buildAvatarUrl(row.installation, row.agentTechnicalName ?? '', {
            size: ROW_AVATAR_SIZE,
          }) ?? ''
        }
      />
      <Text
        variant="body-medium"
        truncate
        title={row.agentName}
        style={{ minWidth: 0 }}
      >
        {row.agentName}
      </Text>
    </Flex>
  );
}
