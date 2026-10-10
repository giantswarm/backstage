import { ReactNode, useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import {
  EmptyStateCard,
  LoadingIndicator,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import type { AvatarSize } from '../../lib/agentAvatar';
import { agentParts, agentStatus, searchAgents } from '../../lib/customize';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { type AgentRow, useAgents } from '../AgentsDataProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

/** Twice the rendered 32px (bui's medium avatar), for sharp 2x displays. */
const ROW_AVATAR_SIZE: AvatarSize = 96;

/** Below this width the facts wrap under the name instead of in columns. */
const NARROW = '@media (max-width: 599px)';

const useStyles = makeStyles({
  // The prototype's agent list: one rounded, bordered surface, an avatar row
  // per agent — no column headers.
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
    background: 'var(--bui-bg-neutral-1)',
    overflow: 'hidden',
  },
  item: {
    borderBottom: '1px solid var(--bui-border-1)',
    '&:last-child': {
      borderBottom: 0,
    },
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-3)',
    padding: 'var(--bui-space-3) var(--bui-space-4)',
    color: 'var(--bui-fg-primary)',
    textDecoration: 'none',
    '&:hover': {
      background: 'var(--bui-bg-neutral-2)',
      textDecoration: 'none',
    },
  },
  // Name and description, then the facts: side by side where there is room,
  // the facts wrapping under the name at phone width.
  body: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 'var(--bui-space-4)',
    rowGap: 'var(--bui-space-1)',
  },
  main: {
    flex: '1 1 220px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  nameLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-2)',
    minWidth: 0,
  },
  status: {
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--bui-space-1)',
  },
  facts: {
    flex: '0 1 auto',
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: 'var(--bui-space-4)',
    rowGap: 2,
    [NARROW]: {
      flexBasis: '100%',
    },
  },
  // Fixed-width fact columns line the rows up, as the prototype's do.
  fact: {
    flex: '0 0 150px',
    minWidth: 0,
    [NARROW]: {
      flex: '0 1 auto',
    },
  },
});

export type CustomizeAgentsPanelProps = {
  search: string;
};

/**
 * One agent as the prototype's list row: avatar, name — with its state inline
 * only when it is not Ready — and what it is for, then its model, its skills
 * and connectors, and the environment when there is more than one.
 */
function AgentListItem({
  row,
  href,
  avatarUrl,
  showInstallation,
}: {
  row: AgentRow;
  href?: string;
  avatarUrl?: string;
  showInstallation: boolean;
}) {
  const classes = useStyles();
  const status = agentStatus(row);
  const parts = agentParts(row);
  const facts: { key: string; text: string; label: string }[] = [
    { key: 'model', text: row.model ?? '', label: 'Model' },
    { key: 'parts', text: parts, label: 'Skills and connectors' },
    ...(showInstallation
      ? [{ key: 'installation', text: row.installation, label: 'Environment' }]
      : []),
  ];

  const content: ReactNode = (
    <>
      <AgentAvatar
        size="medium"
        purpose="decoration"
        name={row.name}
        src={avatarUrl ?? ''}
      />
      <div className={classes.body}>
        <div className={classes.main}>
          <div className={classes.nameLine}>
            <Text as="span" variant="body-medium" weight="bold" truncate>
              {row.name}
            </Text>
            {/* The state shows only when it needs a look, as in the
                prototype; a Ready agent's state is on its own page. */}
            {status.tone !== 'success' && (
              <span className={classes.status} title={row.readinessMessage}>
                <StatusDot tone={status.tone} />
                <Text as="span" variant="body-small" color="secondary">
                  {status.label}
                </Text>
              </span>
            )}
          </div>
          {row.description && (
            <Text
              as="span"
              variant="body-small"
              color="secondary"
              truncate
              title={row.description}
            >
              {row.description}
            </Text>
          )}
        </div>
        <div className={classes.facts}>
          {facts.map(fact => (
            <Text
              key={fact.key}
              as="span"
              variant="body-small"
              color="secondary"
              truncate
              className={classes.fact}
              title={fact.text ? `${fact.label}: ${fact.text}` : undefined}
            >
              {fact.text}
            </Text>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <li className={classes.item}>
      {href ? (
        <Link href={href} className={classes.row}>
          {content}
        </Link>
      ) : (
        <div className={classes.row}>{content}</div>
      )}
    </li>
  );
}

/**
 * The Agents tab of the shell's Customize screen, in the prototype's
 * presentation: one rounded list of the agents in scope, an avatar row each
 * with what it is for, its model and its parts, each row opening the agent's
 * page. Global, with no organization grouping or filter (D4): the Kubernetes
 * namespace an agent lives in is a technical detail of its own page. Must be
 * mounted inside a `CustomizeDataProvider`.
 */
export function CustomizeAgentsPanel({ search }: CustomizeAgentsPanelProps) {
  const classes = useStyles();
  const { rows, isLoading, hasInstallations, unreachableInstallations } =
    useAgents();
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  const visible = useMemo(() => searchAgents(rows, search), [rows, search]);
  const showInstallation = new Set(rows.map(row => row.installation)).size > 1;

  let body;
  if (isLoading) {
    body = <LoadingIndicator label="Reading your agents…" />;
  } else if (!hasInstallations) {
    body = (
      <EmptyStateCard
        title="No environments configured"
        description="Agents are read from your environments, and this portal knows none."
      />
    );
  } else if (rows.length === 0) {
    body =
      unreachableInstallations.length > 0 ? null : (
        <EmptyStateCard
          title="No agents yet"
          description="Create an agent to start sessions with it."
        />
      );
  } else if (visible.length === 0) {
    body = (
      <Text as="p" variant="body-medium" color="secondary">
        No agents match “{search.trim()}”.
      </Text>
    );
  } else {
    body = (
      <ul className={classes.list} aria-label="Agents">
        {visible.map(row => (
          <AgentListItem
            key={row.id}
            row={row}
            href={agentDetailRoute?.({
              installation: row.installation,
              namespace: row.namespace,
              name: row.technicalName,
            })}
            avatarUrl={buildAvatarUrl(row.installation, row.technicalName, {
              size: ROW_AVATAR_SIZE,
            })}
            showInstallation={showInstallation}
          />
        ))}
      </ul>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <UnreachableInstallationsAlert
        installations={unreachableInstallations}
        resourceName="Agents"
      />
      {body}
    </Flex>
  );
}
