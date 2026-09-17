import { ReactNode } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { Plan, PlannedMessage, PlannedPullRequest, Problem } from '../../apis';

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

/** The fix a refusal names, as one action of the form that holds the field. */
export interface ProblemFix {
  label: string;
  apply: () => void;
}

/**
 * The manager's refusals of an entry, each naming the field. A refusal whose
 * fix the form can apply carries it as a button (`fixFor`); the rest name
 * the field for the person.
 */
export function Problems({
  problems,
  fixFor,
}: {
  problems?: Problem[];
  fixFor?: (problem: Problem) => ProblemFix | undefined;
}) {
  if (!problems || problems.length === 0) {
    return null;
  }
  return (
    <Alert
      status="danger"
      title="Refused by the schema"
      description={
        <ul data-testid="problems" style={{ margin: 0, paddingLeft: 16 }}>
          {problems.map((problem, index) => {
            const fix = fixFor?.(problem);
            return (
              <li key={`${problem.field}-${index}`}>
                <code>{problem.field}</code>: {problem.message}
                {fix && (
                  <>
                    {' '}
                    <Button
                      variant="secondary"
                      size="small"
                      onPress={fix.apply}
                    >
                      {fix.label}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      }
    />
  );
}

/**
 * The pull request a write would open, as the manager plans it: where and as
 * whom on one line, what on the next (`Text` is inline; the column keeps the
 * two lines apart wherever the view sits, a list item included).
 */
export function PlannedPullRequestView({
  pullRequest: pr,
  children,
}: {
  pullRequest: PlannedPullRequest;
  children?: ReactNode;
}) {
  return (
    <Flex direction="column" gap="1" data-testid="planned-pull-request">
      <Text variant="body-small" color="secondary">
        {children ?? 'Pull request'} on {pr.repository} as {pr.as}
      </Text>
      <Text variant="body-small">
        {pr.title} — branch {pr.branch}; files: {pr.files.join(', ')}
      </Text>
    </Flex>
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
      <PlannedPullRequestView pullRequest={plan.pullRequest} />
      {plan.ask && <Message kind="Approval asked" message={plan.ask} />}
      {plan.notice && <Message kind="Notice" message={plan.notice} />}
    </Flex>
  );
}
