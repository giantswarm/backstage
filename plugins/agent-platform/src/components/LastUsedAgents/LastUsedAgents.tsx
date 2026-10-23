import { useId, useMemo } from 'react';
import { Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import type { AvatarSize } from '../../lib/agentAvatar';
import { recentAgentUses } from '../../lib/recentAgents';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { useAgents } from '../AgentsDataProvider';
import { useSessions } from '../SessionsDataProvider';

/** Twice the rendered 32px, for sharp 2x displays. */
const CARD_AVATAR_SIZE: AvatarSize = 96;

const useStyles = makeStyles({
  head: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: 'var(--bui-space-3)',
    rowGap: 2,
    marginBottom: 'var(--bui-space-3)',
  },
  // The artboard's three cards side by side; one per line at phone width.
  grid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 'var(--bui-space-4)',
    '@media (max-width: 599px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: 'var(--bui-space-2)',
    },
  },
  // The card opens the agent, as the list's rows do: its name is the link,
  // whose hit area stretches over the whole card, so the link is named by the
  // agent alone and the card stays one target.
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-3)',
    height: '100%',
    boxSizing: 'border-box',
    padding: 'var(--bui-space-3) var(--bui-space-4)',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
    background: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-fg-primary)',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    '&:hover': {
      borderColor: 'var(--bui-border-2)',
      boxShadow: '0 4px 16px rgba(0, 38, 69, 0.06)',
    },
  },
  nameLink: {
    color: 'inherit',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'none',
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: 12,
    },
    // The focus ring goes round the card, as the hover does.
    '&[data-focus-visible]': {
      outline: 'none',
    },
    '&[data-focus-visible]::after': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: -2,
    },
  },
  text: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
});

/**
 * Customize → Agents' "Last used by you" strip, the artboard's only agent
 * cards: the agents of the person's latest sessions (at most three, so the
 * strip is the same size at 3 agents and at 300), each opening the agent's
 * page like every other item of the list; the page's **Use this agent**
 * starts a session. Hidden when the person has no session with a startable
 * agent yet.
 *
 * Reads `useAgents` and `useSessions`, so it renders under an
 * `AgentsDataProvider` and a `SessionsDataProvider`. Sessions from an
 * installation whose session list is not scoped to the signed-in user (kagent
 * in `unsecure` mode) are left out: they would not be "by you".
 */
export function LastUsedAgents() {
  const classes = useStyles();
  const headingId = useId();
  const buildAvatarUrl = useAgentAvatarUrl();
  const { rows: agents } = useAgents();
  const { rows: sessions, notUserScopedInstallations } = useSessions();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  const recent = useMemo(() => {
    const notMine = new Set(notUserScopedInstallations);
    return recentAgentUses(
      sessions.filter(session => !notMine.has(session.installation)),
      agents,
    );
  }, [agents, sessions, notUserScopedInstallations]);

  // Each card opens the agent's page; with no page to open, the strip has
  // nothing to offer.
  if (recent.length === 0 || !agentDetailRoute) {
    return null;
  }

  return (
    <section aria-labelledby={headingId}>
      <div className={classes.head}>
        <Text as="h2" id={headingId} variant="title-x-small">
          Last used by you
        </Text>
        <Text as="span" variant="body-small" color="secondary">
          Your most recent agents
        </Text>
      </div>
      <ul className={classes.grid}>
        {recent.map(({ agent, lastUsedAt }) => (
          <li key={agent.id} className={classes.card}>
            <AgentAvatar
              size="medium"
              purpose="decoration"
              name={agent.name}
              src={
                buildAvatarUrl(agent.installation, agent.technicalName, {
                  size: CARD_AVATAR_SIZE,
                }) ?? ''
              }
            />
            <span className={classes.text}>
              <Link
                href={agentDetailRoute({
                  installation: agent.installation,
                  namespace: agent.namespace,
                  name: agent.technicalName,
                })}
                variant="body-medium"
                weight="bold"
                truncate
                className={classes.nameLink}
              >
                {agent.name}
              </Link>
              {lastUsedAt && (
                <Text as="span" variant="body-small" color="secondary">
                  <DateComponent value={lastUsedAt} relative />
                </Text>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
