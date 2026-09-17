import { Alert, Flex, Text } from '@backstage/ui';
import { Plan, PlannedMessage, Problem } from '../../apis';

const PRE_STYLE = {
  margin: 0,
  padding: 8,
  fontSize: 12,
  whiteSpace: 'pre-wrap' as const,
  border: '1px solid rgba(128,128,128,0.3)',
  borderRadius: 4,
};

/** A rendered team-file entry, as the manager returns it. */
export function EntryBlock({ title, yaml }: { title: string; yaml: string }) {
  return (
    <div>
      <Text variant="body-small" color="secondary">
        {title}
      </Text>
      <pre style={PRE_STYLE} data-testid={`entry-${title.toLowerCase()}`}>
        {yaml}
      </pre>
    </div>
  );
}

/** The manager's refusals of an entry, each naming the field. */
export function Problems({ problems }: { problems?: Problem[] }) {
  if (!problems || problems.length === 0) {
    return null;
  }
  return (
    <Alert
      status="danger"
      title="Refused by the schema"
      description={
        <ul data-testid="problems" style={{ margin: 0, paddingLeft: 16 }}>
          {problems.map((problem, index) => (
            <li key={`${problem.field}-${index}`}>
              <code>{problem.field}</code>: {problem.message}
            </li>
          ))}
        </ul>
      }
    />
  );
}

function Message({ kind, message }: { kind: string; message: PlannedMessage }) {
  const where = message.channel
    ? `${message.channel} (${message.team})`
    : message.team;
  return (
    <Alert
      status={message.deliverable ? 'info' : 'warning'}
      title={`${kind} to ${where}`}
      description={
        <Flex direction="column" gap="1">
          <Text variant="body-small">{message.text}</Text>
          {!message.deliverable && (
            <Text variant="body-small" color="secondary">
              Cannot be delivered{message.reason ? `: ${message.reason}` : ''}.
              An approving review on the pull request is equivalent.
            </Text>
          )}
        </Flex>
      }
    />
  );
}

/**
 * A write's dry run as the manager rendered it: the entry before and after,
 * the schema's refusals, the pull request that would be opened (as whom,
 * which files) and the ask or notice the team would receive. Nothing here is
 * computed by the page.
 */
export function PlanView({ plan }: { plan: Plan }) {
  const pr = plan.pullRequest;
  return (
    <Flex direction="column" gap="3" data-testid="plan">
      <Text variant="body-medium">
        {plan.fromTeam
          ? `${plan.repository}: from ${plan.fromTeam} to ${plan.team}`
          : `${plan.repository} (${plan.team})`}
        {' — '}
        {plan.accepted ? 'accepted' : 'refused'}
      </Text>
      <Problems problems={plan.problems} />
      {plan.before && <EntryBlock title="Before" yaml={plan.before} />}
      {plan.entry && <EntryBlock title="After" yaml={plan.entry} />}
      <div data-testid="planned-pull-request">
        <Text variant="body-small" color="secondary">
          Pull request on {pr.repository} as {pr.as}
        </Text>
        <Text variant="body-small">
          {pr.title} — branch {pr.branch}; files: {pr.files.join(', ')}
        </Text>
      </div>
      {plan.ask && <Message kind="Approval asked" message={plan.ask} />}
      {plan.notice && <Message kind="Notice" message={plan.notice} />}
    </Flex>
  );
}
