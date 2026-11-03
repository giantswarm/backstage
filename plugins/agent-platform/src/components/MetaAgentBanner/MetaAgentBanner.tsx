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
  /**
   * What the agent does for the person, in one or two sentences. Left out
   * where the title already says it all — the strip is then one line.
   */
  description?: ReactNode;
  /** The control that hands over to the agent. */
  action: ReactNode;
};

/**
 * A meta-agent hand-off strip: the tinted band with the meta agent's avatar,
 * a title line, what the agent does, and the control that hands over to it.
 * The create-agent flow (`CreateAgentAssist`), the skill forms
 * (`SkillCreationAssist`) and the workflows overview (`WorkflowCreateAssist`)
 * draw it. Gating on the role is the caller's.
 *
 * **Naming contract (UX review H1).** One strip, three behaviours, each with
 * its own wording so the label says what pressing does:
 * - "Let X help" opens a side chat beside the form and keeps the form; nothing
 *   is sent until the person writes (`CreateAgentAssist`).
 * - "Ask X …" opens New session with X preselected; nothing starts until the
 *   person sends (`AgentsHelperBanner`, the same tint without this component).
 * - "<Verb> with X" ("Create with X", "Edit with X", "Evaluate with X") starts
 *   a session with X at once, its first message prepared from the page, and
 *   opens it (`useMetaAgentHandoff`). Where the strip carries such a control,
 *   its title or description says a session starts; a form's typed input goes
 *   with the first message, never lost silently. Header buttons of the same
 *   kind (the skill page's Evaluate, the workflow page's Edit) follow the same
 *   wording.
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
          {description && (
            <Text as="p" variant="body-small" color="secondary">
              {description}
            </Text>
          )}
        </div>
      </div>
      {action}
    </section>
  );
}
