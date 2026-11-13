import { ReactNode } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Link, Text } from '@backstage/ui';
import {
  groupNames,
  joinNames,
  SimpleAccordion,
} from '@giantswarm/backstage-plugin-ui-react';

import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { agentDetailRouteRef } from '../../routes';
import type { BlockedDefaultAgent } from './blockedDefaultAgents';

/** Past this many reasons for failing, the summary stops naming each. */
const FAILURE_GROUPS_IN_SUMMARY = 2;

export type DefaultAgentsBlockedAlertProps = {
  /** From {@link blockedDefaultAgents}; renders nothing when empty. */
  blocked: BlockedDefaultAgent[];
};

/**
 * Names the default agents no session can start with: one environment's, or
 * several at once — the platform's General Assistant on every environment the
 * portal reads, which share one display name and differ only by environment
 * and namespace.
 *
 * The title counts them; the description groups them by reason and names the
 * environments of each (`No model yet on a, b and c. Add one under Models.`),
 * and for more than one agent, every agent — environment, namespace and
 * reason, linked to its page — sits behind a disclosure, as
 * `UnreachableInstallationsAlert` lists its environments.
 */
export function DefaultAgentsBlockedAlert({
  blocked,
}: DefaultAgentsBlockedAlertProps) {
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const { models } = useCustomizePaths();
  if (blocked.length === 0) {
    return null;
  }

  const count = blocked.length;
  const names = [...new Set(blocked.map(({ agent }) => agent.name))];
  let title = `${count} default agents cannot start sessions`;
  if (count === 1) {
    title = `${names[0]} cannot start sessions`;
  } else if (names.length === 1) {
    title = `${count} ${names[0]} agents cannot start sessions`;
  }

  const hrefOf = ({ agent }: BlockedDefaultAgent) =>
    agentDetailRoute?.({
      installation: agent.installation,
      namespace: agent.namespace,
      name: agent.technicalName,
    });
  const modelsLink = models ? (
    <Link href={models} variant="body-small">
      Models
    </Link>
  ) : (
    'Models'
  );
  const addModel = <>Add one under {modelsLink}.</>;

  if (count === 1) {
    const [entry] = blocked;
    const href = hrefOf(entry);
    const place = `${entry.agent.installation}, namespace ${entry.agent.namespace}`;
    const placeNode = href ? (
      <Link href={href} variant="body-small">
        {place}
      </Link>
    ) : (
      place
    );
    return (
      <Alert
        status="info"
        icon
        title={title}
        description={
          <Text variant="body-small">
            {entry.reason === 'no-model' ? (
              <>
                No model yet on {placeNode}. {addModel}
              </>
            ) : (
              <>
                Failed on {placeNode}
                {entry.message ? `: ${entry.message}` : '.'}
              </>
            )}
          </Text>
        }
      />
    );
  }

  const environmentsOf = (entries: BlockedDefaultAgent[]) =>
    joinNames([...new Set(entries.map(({ agent }) => agent.installation))]);
  const noModel = blocked.filter(entry => entry.reason === 'no-model');
  const failed = blocked.filter(entry => entry.reason === 'failed');
  const failureGroups = groupNames(
    failed,
    ({ agent }) => agent.id,
    entry => entry.message ?? '',
  );
  const lines: ReactNode[] = [];
  if (noModel.length > 0) {
    lines.push(
      <>
        No model yet on {environmentsOf(noModel)}. {addModel}
      </>,
    );
  }
  if (failureGroups.length > FAILURE_GROUPS_IN_SUMMARY) {
    lines.push(
      `Failed on ${environmentsOf(
        failed,
      )}, for different reasons that the list below names.`,
    );
  } else {
    for (const { group, names: ids } of failureGroups) {
      const entries = failed.filter(({ agent }) => ids.includes(agent.id));
      lines.push(
        `Failed on ${environmentsOf(entries)}${group ? `: ${group}` : '.'}`,
      );
    }
  }

  return (
    <Alert
      status="info"
      icon
      title={title}
      description={
        <Flex direction="column" gap="2">
          {lines.map((line, index) => (
            <Text key={index} variant="body-small">
              {line}
            </Text>
          ))}
          <SimpleAccordion title={`All ${count} agents`} headingLevel={4}>
            <Flex direction="column" gap="1" role="list">
              {blocked.map(entry => {
                const href = hrefOf(entry);
                const place = `${entry.agent.installation} · ${entry.agent.namespace}`;
                return (
                  <Text
                    key={entry.agent.id}
                    as="div"
                    role="listitem"
                    variant="body-small"
                  >
                    {href ? (
                      <Link href={href} variant="body-small">
                        {place}
                      </Link>
                    ) : (
                      place
                    )}
                    {' — '}
                    {reasonText(entry)}
                  </Text>
                );
              })}
            </Flex>
          </SimpleAccordion>
        </Flex>
      }
    />
  );
}

function reasonText({ reason, message }: BlockedDefaultAgent): string {
  if (reason === 'no-model') {
    return 'No model yet.';
  }
  return message ? `Failed: ${message}` : 'Failed.';
}
