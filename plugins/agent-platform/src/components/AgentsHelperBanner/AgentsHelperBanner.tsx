import { ButtonIcon, ButtonLink, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import CloseIcon from '@material-ui/icons/Close';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useDismissedHint } from '../../hooks/useDismissedHint';
import { useMetaAgent } from '../../hooks/useMetaAgent';
import type { AvatarSize } from '../../lib/agentAvatar';
import { newSessionHref } from '../../lib/newSessionLink';
import { AgentAvatar } from '../AgentAvatar';
import type { AgentRow } from '../AgentsDataProvider';
import { isStartableAgent } from '../NewSessionComposer';

/** The id the dismissal is stored under (see `useDismissedHint`). */
const HINT_ID = 'agentsHelper';

/** Twice the rendered 32px, for sharp 2x displays. */
const AVATAR_SIZE: AvatarSize = 96;

const useStyles = makeStyles({
  // The artboard's tinted strip: the meta agent's avatar, one line of copy,
  // the way to ask it — wrapping to two lines at phone width.
  banner: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-3)',
    padding: 'var(--bui-space-3) var(--bui-space-4)',
    // Clear of the dismiss button in the corner.
    paddingRight: 'calc(var(--bui-space-4) + 28px)',
    borderRadius: 12,
    background: 'var(--agent-shell-rail-bg, #f0f7f9)',
  },
  copy: {
    flex: '1 1 280px',
    minWidth: 0,
  },
  dismiss: {
    position: 'absolute',
    top: 'var(--bui-space-2)',
    right: 'var(--bui-space-2)',
  },
});

function AgentsHelperBannerContent({ agent }: { agent: AgentRow }) {
  const classes = useStyles();
  const buildAvatarUrl = useAgentAvatarUrl();
  const { dismissed, isKnown, dismiss } = useDismissedHint(HINT_ID);

  // Held back until the stored dismissal is known, so a banner the person
  // already closed doesn't flash on every visit.
  if (!isKnown || dismissed) {
    return null;
  }

  return (
    <section
      className={classes.banner}
      aria-label={`Ask ${agent.name} about agents`}
    >
      <AgentAvatar
        size="medium"
        purpose="decoration"
        name={agent.name}
        src={
          buildAvatarUrl(agent.installation, agent.technicalName, {
            size: AVATAR_SIZE,
          }) ?? ''
        }
      />
      <Text as="p" variant="body-medium" className={classes.copy}>
        Not sure which agent fits?{' '}
        <Text as="span" variant="body-medium" color="secondary">
          Describe your task and {agent.name} suggests the right agent, or
          offers to create one.
        </Text>
      </Text>
      <ButtonLink
        href={newSessionHref(agent)}
        variant="secondary"
        size="small"
        iconEnd={<ArrowForwardIcon fontSize="small" />}
      >
        Ask {agent.name} about agents
      </ButtonLink>
      <ButtonIcon
        className={classes.dismiss}
        variant="tertiary"
        size="small"
        icon={<CloseIcon fontSize="small" />}
        aria-label="Dismiss, and don't show this again"
        onPress={() => {
          dismiss().catch(() => {});
        }}
      />
    </section>
  );
}

/**
 * Customize → Agents' helper banner (the artboard's Swarmgeist strip): points
 * at the agent serving the `generalInformation` meta-agent role, which can
 * suggest the right agent for a task or offer to create one. Its button opens
 * a new session with that agent preselected.
 *
 * Shown only where the role resolves to an agent that can be started
 * (`agentPlatform.metaAgents.generalInformation`, decision G13) — renders
 * nothing at all otherwise, without even reading the dismissal — and gone for
 * good, per person, once dismissed (`useDismissedHint`, bucket
 * `agent-platform`, the same mechanism as the Slack promo).
 *
 * Reads `useAgents` through `useMetaAgent`, so it renders under an
 * `AgentsDataProvider`.
 */
export function AgentsHelperBanner() {
  const agent = useMetaAgent('generalInformation');

  return agent && isStartableAgent(agent) ? (
    <AgentsHelperBannerContent agent={agent} />
  ) : null;
}
