import { Alert, ButtonLink, Flex, Link, Text } from '@backstage/ui';
import {
  DataBar,
  DateComponent,
  FactList,
  GSMarkdownContent,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';
import { useEpicHistory } from '../../hooks/useEpic';
import { epicPlanState } from '../../lib/epic';
import { linkTarget } from '../../lib/hive';
import { PLAN_STATE_LABELS, progressPercent } from '../../lib/magazine';
import { useEpic } from './context';
import { EpicColumns } from './EpicLayout';

/** What waits, in one line: the plan's next step or the epic's status. */
function nextStep(state: ReturnType<typeof epicPlanState>): string {
  switch (state) {
    case 'grilling':
      return 'The plan is being grilled: open questions first.';
    case 'draft':
      return 'The plan is a draft: not ready for review yet.';
    case 'review':
      return 'The plan waits for review.';
    case 'merged':
      return 'The plan is merged: the work follows it.';
    default:
      return 'No plan yet.';
  }
}

/**
 * Where the epic stands, as a briefing: progress, blocker, the plan's next
 * step and what to try; then the issue's description and comments.
 */
export function EpicOverviewTab() {
  const epic = useEpic();
  const { card, item, lane } = epic;
  const { group } = useEpicHistory('months', epic.key);
  const planState = epicPlanState(card, epic.plans);
  const tryIt = card?.tryIt ?? group?.tryIt;

  const main = (
    <Flex direction="column" gap="4">
      {card?.blocker && (
        <Alert
          status="warning"
          icon
          title="Blocked"
          description={
            <>
              {card.blocker.reason}
              {card.blocker.since && (
                <>
                  {' · since '}
                  <DateComponent value={card.blocker.since} relative />
                </>
              )}
              {card.blocker.owner && ` · ${card.blocker.owner}`}
            </>
          }
        />
      )}
      <InfoCard
        title="Where it stands"
        headerActions={
          tryIt && (
            <ButtonLink
              href={tryIt.url}
              {...linkTarget(tryIt.url)}
              variant="secondary"
              size="small"
            >
              {tryIt.label}
            </ButtonLink>
          )
        }
      >
        <FactList
          maxWidth={null}
          facts={[
            ...(card?.progress && card.progress.total > 0
              ? [
                  {
                    label: 'Sub-issues',
                    value: (
                      <DataBar
                        label={`${card.progress.done} of ${card.progress.total} done`}
                        value={progressPercent(card.progress)}
                        max={100}
                        color="var(--bui-fg-announcement)"
                      />
                    ),
                  },
                ]
              : []),
            ...(lane ? [{ label: 'Lane', value: lane.title }] : []),
            {
              label: 'Plan',
              value: (
                <Text variant="body-small">
                  {planState && (
                    <Link href={`${epic.base}/plan`}>
                      {PLAN_STATE_LABELS[planState]}
                    </Link>
                  )}
                  {planState && ' · '}
                  {nextStep(planState)}
                </Text>
              ),
            },
            ...(card?.updatedAt
              ? [
                  {
                    label: 'Last movement',
                    value: <DateComponent value={card.updatedAt} relative />,
                  },
                ]
              : []),
          ]}
        />
      </InfoCard>
      <InfoCard title="Description">
        {item.body ? (
          <GSMarkdownContent content={item.body} />
        ) : (
          <Text variant="body-medium" color="secondary">
            This epic has no description.
          </Text>
        )}
      </InfoCard>
      {item.comments.length > 0 && (
        <InfoCard title={`Comments (${item.comments.length})`}>
          <Flex direction="column" gap="4">
            {item.comments.map((comment, index) => (
              <Flex key={index} direction="column" gap="1">
                <Text variant="body-small" color="secondary">
                  {comment.author} ·{' '}
                  <DateComponent value={comment.createdAt} relative />
                </Text>
                <GSMarkdownContent content={comment.body} />
              </Flex>
            ))}
          </Flex>
        </InfoCard>
      )}
    </Flex>
  );

  return <EpicColumns main={main} />;
}
