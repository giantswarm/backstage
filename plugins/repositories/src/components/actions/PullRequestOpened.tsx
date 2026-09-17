import { Alert, ButtonLink, Flex, Text } from '@backstage/ui';
import { Committed, Delivery } from '../../apis';

function DeliveryLine({
  kind,
  delivery,
}: {
  kind: string;
  delivery: Delivery;
}) {
  const where = delivery.channel
    ? `${delivery.channel} (${delivery.team})`
    : delivery.team;
  return (
    <Text variant="body-small" color="secondary">
      {delivery.delivered
        ? `${kind} posted to ${where}.`
        : `${kind} to ${where} could not be delivered${delivery.error ? `: ${delivery.error}` : ''} — an approving review on GitHub is equivalent.`}
    </Text>
  );
}

/**
 * The pull request a write in `mode: commit` opened -- its number and title,
 * what became of the ask and notice, the link -- for an alert that has its
 * own title. Nothing when the manager opened none.
 */
export function PullRequestBody({ result }: { result: Committed }) {
  const pr = result.pullRequest;
  if (!pr) {
    return null;
  }
  return (
    <Flex direction="column" gap="2" data-testid="pull-request-opened">
      <Text variant="body-small">
        #{pr.number} {pr.title}
      </Text>
      {result.ask && <DeliveryLine kind="The ask" delivery={result.ask} />}
      {result.notice && (
        <DeliveryLine kind="The notice" delivery={result.notice} />
      )}
      <div>
        <ButtonLink
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          size="small"
        >
          Open the pull request ↗
        </ButtonLink>
      </div>
    </Flex>
  );
}

/**
 * What a write in `mode: commit` answered: the team-file pull request the
 * manager opened as the person, and what became of the ask and notice it
 * posted. The attribution is the manager's -- the author it reports is the
 * GitHub login of the person's grant.
 */
export function PullRequestOpened({ result }: { result: Committed }) {
  const pr = result.pullRequest;
  if (!pr) {
    return (
      <Alert
        status="info"
        title="Committed"
        description="The manager accepted the request without opening a pull request."
      />
    );
  }
  return (
    <Alert
      status="success"
      title={`Pull request opened${pr.author ? ` as ${pr.author}` : ''}`}
      description={<PullRequestBody result={result} />}
    />
  );
}
