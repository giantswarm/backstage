import { CSSProperties, Fragment, ReactNode, useMemo } from 'react';
import { Flex, Link, Text } from '@backstage/ui';
import { DateComponent, FactList } from '@giantswarm/backstage-plugin-ui-react';
import { Action, ActionRevert, Definition, Installation } from '../apis';
import { inputFacts, stateDetailOf, verbOf } from '../lib/actions';
import { linkify, repositoriesOf } from '../lib/links';
import { fieldsOf, formOf } from '../lib/schemaForm';
import { ActionStateTag } from './ActionStateTag';
import { READY_TO_MERGE_STEP } from './StateTag';

const LIST_STYLE: CSSProperties = { margin: 0, paddingLeft: 16 };

/**
 * An action in one line: the verb, the capability and who asked, then its
 * state and when it was asked, relative -- `enable agent-platform by ada ·
 * Refused · 3 days ago`. The history's entries and the card's *Last
 * action* read the same way.
 */
export function ActionLine({ action }: { action: Action }) {
  const { spec, status } = action;
  return (
    <Text as="span" variant="body-medium" data-testid="action-line">
      <Text as="span" variant="body-medium" weight="bold">
        {verbOf(spec.kind)} {spec.capability}
      </Text>
      {spec.actor?.login ? ` by ${spec.actor.login}` : ''}
      {status?.state && (
        <>
          {' · '}
          <ActionStateTag state={status.state} detail={stateDetailOf(action)} />
        </>
      )}
      {action.createdAt && (
        <>
          {' · '}
          <DateComponent value={action.createdAt} relative />
        </>
      )}
    </Text>
  );
}

/** A message with what it names on GitHub linked: the repositories, the files, the URLs. */
function Message({
  text,
  repositories,
  testId,
}: {
  text: string;
  repositories: string[];
  testId?: string;
}) {
  return (
    <Text as="span" variant="body-small" color="secondary" data-testid={testId}>
      {linkify(text, repositories).map((part, i) =>
        part.href ? (
          <Link key={i} href={part.href} target="_blank" rel="noopener">
            {part.text}
          </Link>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </Text>
  );
}

/**
 * A pull request's revert after its state: the pull request it came
 * through where GitHub links one, else the commit, linked where the
 * manager recorded the page -- `merged, reverted by #12`.
 */
function RevertedBy({ revert }: { revert: ActionRevert }) {
  const name = revert.pullRequest
    ? `#${revert.pullRequest}`
    : revert.commit.slice(0, 7);
  const href = revert.pullRequest ? revert.pullRequestUrl : revert.url;
  return (
    <span data-testid="action-revert">
      {', reverted by '}
      {href ? (
        <Link href={href} target="_blank" rel="noopener">
          {name}
        </Link>
      ) : (
        name
      )}
    </span>
  );
}

/** A part of the record with its own heading, as *Pull requests*. */
function Block({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId}>
      <Text variant="body-small" weight="bold">
        {title}
      </Text>
      {children}
    </div>
  );
}

/**
 * The record of an action under its line: what was asked, as the choices
 * the person made; the actor's next step where the action is ready to
 * merge; the pull requests with their state; the approval and its
 * thread; the rollout per installation; and the manager's last word on it,
 * with every repository and file it names linked. `installation` gives the
 * repositories a message may name, `definition` the labels of the choices.
 */
export function ActionDetails({
  action,
  installation,
  definition,
}: {
  action: Action;
  installation: Pick<Installation, 'repositories'>;
  definition?: Definition;
}) {
  const { spec, status } = action;
  const approval = status?.approval;
  const schema = definition?.inputSchema;
  const fields = useMemo(() => fieldsOf(formOf(schema ?? {})), [schema]);
  const asked = useMemo(
    () => inputFacts(spec.inputs, fields),
    [spec.inputs, fields],
  );
  const repositories = repositoriesOf(installation, action);
  return (
    <Flex direction="column" gap="2" data-testid={`action-${action.name}`}>
      {spec.installations.length > 1 && (
        <Text variant="body-small" color="secondary">
          On {spec.installations.join(', ')}
        </Text>
      )}
      {asked.length > 0 && (
        <Block title="Asked for" testId="action-inputs">
          <FactList facts={asked} maxWidth={null} />
        </Block>
      )}
      {status?.state === 'ready to merge' && (
        <Text variant="body-small" data-testid="action-next-step">
          {READY_TO_MERGE_STEP}
        </Text>
      )}
      {!!status?.pullRequests?.length && (
        <Block title="Pull requests" testId="action-pull-requests">
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
                {pr.revert && <RevertedBy revert={pr.revert} />}
              </li>
            ))}
          </ul>
        </Block>
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
      {status?.withdrawal && (
        <Text variant="body-small" data-testid="action-withdrawal">
          Withdrawn by {status.withdrawal.by} — {status.withdrawal.reason}
        </Text>
      )}
      {!!status?.rollout?.installations?.length && (
        <ul style={LIST_STYLE} data-testid="action-rollout">
          {status.rollout.installations.map(i => (
            <li key={i.name}>
              {i.name}: {i.state ?? '—'}
              {i.message && (
                <>
                  {' — '}
                  <Message text={i.message} repositories={repositories} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {status?.result?.message && (
        <Message
          text={status.result.message}
          repositories={repositories}
          testId="action-result"
        />
      )}
    </Flex>
  );
}

/**
 * An Action record as the manager keeps it, on its own: the line, then the
 * record -- the dialog's answer after a commit.
 */
export function ActionView(props: {
  action: Action;
  installation: Pick<Installation, 'repositories'>;
  definition?: Definition;
}) {
  return (
    <Flex direction="column" gap="2">
      <ActionLine action={props.action} />
      <ActionDetails {...props} />
    </Flex>
  );
}
