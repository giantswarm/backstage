import { Flex, Link, Text } from '@backstage/ui';
import { Action } from '../apis';
import { StateTag } from './StateTag';

const LIST_STYLE = { margin: 0, paddingLeft: 16 };

/**
 * An Action record as the manager keeps it: what was asked, by whom, the
 * pull requests with their state, the approval and its thread, the rollout
 * per installation and the result.
 */
export function ActionView({ action }: { action: Action }) {
  const { spec, status } = action;
  const approval = status?.approval;
  return (
    <Flex direction="column" gap="2" data-testid={`action-${action.name}`}>
      <Flex gap="2" align="center">
        <Text variant="body-medium" weight="bold">
          {spec.kind} {spec.capability}
        </Text>
        {status?.state && <StateTag state={status.state} />}
      </Flex>
      <Text variant="body-small" color="secondary">
        {action.name}
        {spec.actor?.login ? ` — by ${spec.actor.login}` : ''}
        {action.createdAt ? ` — ${action.createdAt}` : ''}
        {spec.installations.length ? ` — ${spec.installations.join(', ')}` : ''}
      </Text>
      {!!status?.pullRequests?.length && (
        <div data-testid="action-pull-requests">
          <Text variant="body-small" weight="bold">
            Pull requests
          </Text>
          <ul style={LIST_STYLE}>
            {status.pullRequests.map(pr => (
              <li key={`${pr.repository}#${pr.number}`}>
                {pr.url ? (
                  <Link href={pr.url} target="_blank" rel="noopener">
                    {pr.repository}
                    {pr.number ? `#${pr.number}` : ''}
                  </Link>
                ) : (
                  `${pr.repository}${pr.number ? `#${pr.number}` : ''}`
                )}
                {pr.state ? ` — ${pr.state}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {approval && (
        <Text variant="body-small" data-testid="action-approval">
          Approval: {approval.decision ?? 'pending'}
          {approval.decidedBy ? ` by ${approval.decidedBy}` : ''}
          {approval.reason ? ` — ${approval.reason}` : ''}
          {approval.channel ? ` (${approval.channel})` : ''}
          {approval.url && (
            <>
              {' '}
              <Link href={approval.url} target="_blank" rel="noopener">
                thread
              </Link>
            </>
          )}
        </Text>
      )}
      {!!status?.rollout?.installations?.length && (
        <ul style={LIST_STYLE} data-testid="action-rollout">
          {status.rollout.installations.map(i => (
            <li key={i.name}>
              {i.name}: {i.state ?? '—'}
              {i.message ? ` — ${i.message}` : ''}
            </li>
          ))}
        </ul>
      )}
      {status?.result?.message && (
        <Text variant="body-small" color="secondary">
          {status.result.message}
        </Text>
      )}
    </Flex>
  );
}
