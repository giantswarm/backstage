import type { ReactNode } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import type { AvatarSize } from '../../lib/agentAvatar';
import { AgentAvatar } from '../AgentAvatar';
import type { AgentRow } from '../AgentsDataProvider';

/** Twice the rendered 32px, for sharp 2x displays. */
const AVATAR_SIZE: AvatarSize = 96;

const useStyles = makeStyles({
  // The CreateAgent artboard's tinted Swarm Operator strip above the form:
  // the meta agent's avatar, a title line and what it does, the control that
  // hands over to it — wrapping to stacked lines at phone width. Same tint
  // and spacing as Customize → Agents' helper banner, so the two read as one
  // idiom.
  banner: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-3) var(--bui-space-4)',
    padding: 'var(--bui-space-4)',
    borderRadius: 12,
    background: 'var(--agent-shell-rail-bg, #f0f7f9)',
  },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-3)',
    flex: '1 1 260px',
    minWidth: 0,
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
});

export type MetaAgentBannerProps = {
  /** The meta agent the form hands over to (its avatar is shown). */
  agent: AgentRow;
  /** The strip's accessible name, e.g. "Set up the agent with Swarm Operator". */
  label: string;
  /** The bold first line. */
  title: ReactNode;
  /** What the agent does for the person, in one or two sentences. */
  description: ReactNode;
  /** The control that hands over to the agent. */
  action: ReactNode;
};

/**
 * A create/edit form's meta-agent hand-off strip: the tinted band above the
 * form with the meta agent's avatar, a title line, what the agent does, and
 * the control that hands over to it. The create-agent flow's "Let Swarm
 * Operator help" (`CreateAgentAssist`) and the skill forms' skill-creator
 * hand-off (`SkillCreationAssist`) both draw it, so every form that hands
 * over to a meta agent reads the same. Gating on the role is the caller's.
 */
export function MetaAgentBanner({
  agent,
  label,
  title,
  description,
  action,
}: MetaAgentBannerProps) {
  const classes = useStyles();
  const buildAvatarUrl = useAgentAvatarUrl();
  return (
    <section className={classes.banner} aria-label={label}>
      <div className={classes.identity}>
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
        <div className={classes.copy}>
          <Text as="p" variant="body-medium" weight="bold">
            {title}
          </Text>
          <Text as="p" variant="body-small" color="secondary">
            {description}
          </Text>
        </div>
      </div>
      {action}
    </section>
  );
}
