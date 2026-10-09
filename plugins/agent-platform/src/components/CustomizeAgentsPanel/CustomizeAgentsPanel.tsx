import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Badge, Card, CardBody, Flex, Grid, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  EmptyStateCard,
  LoadingIndicator,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import type { AvatarSize } from '../../lib/agentAvatar';
import {
  agentParts,
  agentStatus,
  inOrganization,
  organizationsOf,
  searchAgents,
} from '../../lib/customize';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { type AgentRow, useAgents } from '../AgentsDataProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

const CARD_AVATAR_SIZE: AvatarSize = 96;

const useStyles = makeStyles({
  card: {
    height: '100%',
  },
  description: {
    minHeight: '2.8em',
  },
  name: {
    overflowWrap: 'anywhere',
  },
});

export type CustomizeAgentsPanelProps = {
  search: string;
  /** The organization (namespace) to show, or `'all'`. */
  organization: string;
};

function AgentCard({
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
  const body = (
    <CardBody>
      <Flex direction="column" gap="3">
        <Flex align="center" gap="3">
          <AgentAvatar
            size="large"
            purpose="decoration"
            name={row.name}
            src={avatarUrl ?? ''}
          />
          <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
            <Text
              as="h3"
              variant="body-large"
              weight="bold"
              className={classes.name}
            >
              {row.name}
            </Text>
            <StatusDot tone={status.tone} label={status.label} />
          </Flex>
        </Flex>
        <Text
          as="p"
          variant="body-medium"
          color="secondary"
          className={classes.description}
        >
          {row.description}
        </Text>
        <Flex gap="2" style={{ flexWrap: 'wrap' }}>
          {row.model && <Badge size="small">{row.model}</Badge>}
          <Badge size="small">{agentParts(row)}</Badge>
          {showInstallation && <Badge size="small">{row.installation}</Badge>}
        </Flex>
      </Flex>
    </CardBody>
  );
  return href ? (
    <Card href={href} label={row.name} className={classes.card}>
      {body}
    </Card>
  ) : (
    <Card className={classes.card}>{body}</Card>
  );
}

/**
 * The Agents tab of the shell's Customize screen: the agents in scope as
 * cards, grouped by organization, each opening the agent's page. Must be
 * mounted inside a `CustomizeDataProvider`.
 */
export function CustomizeAgentsPanel({
  search,
  organization,
}: CustomizeAgentsPanelProps) {
  const { rows, isLoading, hasInstallations, unreachableInstallations } =
    useAgents();
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  const visible = useMemo(
    () => searchAgents(inOrganization(rows, organization), search),
    [rows, organization, search],
  );
  const groups = useMemo(
    () =>
      organizationsOf(visible).map(namespace => ({
        namespace,
        rows: visible.filter(row => row.namespace === namespace),
      })),
    [visible],
  );
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
        {search.trim()
          ? `No agents match “${search.trim()}”.`
          : 'No agents in this organization.'}
      </Text>
    );
  } else {
    body = (
      <Flex direction="column" gap="8">
        {groups.map(group => (
          <section
            key={group.namespace}
            aria-labelledby={`org-${group.namespace}`}
          >
            <Flex direction="column" gap="3">
              <Text
                as="h2"
                variant="title-x-small"
                id={`org-${group.namespace}`}
              >
                {group.namespace}
              </Text>
              <Grid.Root columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
                {group.rows.map(row => (
                  <Grid.Item key={row.id}>
                    <AgentCard
                      row={row}
                      showInstallation={showInstallation}
                      avatarUrl={buildAvatarUrl(
                        row.installation,
                        row.technicalName,
                        { size: CARD_AVATAR_SIZE },
                      )}
                      href={agentDetailRoute?.({
                        installation: row.installation,
                        namespace: row.namespace,
                        name: row.technicalName,
                      })}
                    />
                  </Grid.Item>
                ))}
              </Grid.Root>
            </Flex>
          </section>
        ))}
      </Flex>
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
