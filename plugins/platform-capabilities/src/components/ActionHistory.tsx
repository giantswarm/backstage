import { Flex, Text } from '@backstage/ui';
import { ActionView } from './ActionView';
import { ErrorAlert } from './ErrorAlert';
import { useActions } from './queries';
import { StateTag } from './StateTag';

/** The installation's actions from `list_actions`, newest first, each opening to its record. */
export function ActionHistory({ installation }: { installation: string }) {
  const actions = useActions(installation);
  return (
    <Flex direction="column" gap="2" data-testid="action-history">
      <Text variant="title-small" as="h3">
        Action history
      </Text>
      {actions.error && (
        <ErrorAlert title="Actions" error={actions.error as Error} />
      )}
      {actions.data && actions.data.actions.length === 0 && (
        <Text variant="body-small" color="secondary">
          No action on record for {installation}.
        </Text>
      )}
      {actions.data?.actions.map(action => (
        <details key={action.name} data-testid={`history-${action.name}`}>
          <summary>
            <Flex gap="2" align="center" style={{ display: 'inline-flex' }}>
              <Text as="span" variant="body-small">
                {action.createdAt ?? ''} {action.spec.kind}{' '}
                {action.spec.capability}
                {action.spec.actor?.login
                  ? ` — ${action.spec.actor.login}`
                  : ''}
              </Text>
              {action.status?.state && <StateTag state={action.status.state} />}
            </Flex>
          </summary>
          <ActionView action={action} />
        </details>
      ))}
    </Flex>
  );
}
