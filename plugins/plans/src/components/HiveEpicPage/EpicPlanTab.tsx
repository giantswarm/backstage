import { useSearchParams } from 'react-router-dom';
import { Badge, ButtonLink, Flex, Link, Text } from '@backstage/ui';
import { Progress } from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  EmptyStateCard,
  GSMarkdownContent,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';
import { plansApiRef } from '../../apis';
import { formatDate } from '../../lib/dates';
import { hiveNowRouteRef, pullRouteRef, rootRouteRef } from '../../routes';
import { PlanReview } from '../PullReviewPage';
import { PlansErrorAlert } from '../PlansErrorAlert';
import { useEpic } from './context';
import { EpicColumns, EpicRail } from './EpicLayout';

/** A merged plan's README, read-only: the review is over. */
function MergedPlan(props: { repo: string; folder: string; path: string }) {
  const plansApi = useApi(plansApiRef);
  const plansRoot = useRouteRef(rootRouteRef);
  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'content', props.repo, 'main', props.path],
    queryFn: () => plansApi.getContent(props.path, undefined, props.repo),
  });
  const allDocuments = `${plansRoot?.() ?? ''}?repo=${encodeURIComponent(
    props.repo,
  )}&plan=${encodeURIComponent(props.folder)}`;
  return (
    <InfoCard
      title={`Merged plan · ${props.folder}`}
      headerActions={
        <ButtonLink href={allDocuments} variant="secondary" size="small">
          All documents
        </ButtonLink>
      }
    >
      {isLoading && <Progress />}
      {error ? (
        <PlansErrorAlert
          title="Failed to load the plan"
          error={error as Error}
        />
      ) : null}
      {data && <GSMarkdownContent content={data.content} />}
    </InfoCard>
  );
}

/**
 * The epic's plan, reviewed where the epic is: the open plan PR's documents
 * in the rail and the reader with inline comments in the reading column
 * (`?pr=` picks one when several name the epic). A merged plan reads
 * read-only; without one, where plans come from.
 */
export function EpicPlanTab() {
  const epic = useEpic();
  const [searchParams] = useSearchParams();
  const pullLink = useRouteRef(pullRouteRef);
  const nowLink = useRouteRef(hiveNowRouteRef);
  const requested = Number(searchParams.get('pr'));
  const pull =
    epic.plans.pulls.find(candidate => candidate.number === requested) ??
    epic.plans.pulls[0];
  const merged = epic.plans.merged[0];

  if (pull) {
    return (
      <PlanReview
        pullNumber={pull.number}
        repo={pull.repo}
        backPath={() => epic.base}
        backLabel="Back to the epic"
      >
        {({ repo, pull: planPull, nav, reader }) => {
          const updated = formatDate(planPull.updatedAt);
          const others = epic.plans.pulls.filter(
            other => other.number !== planPull.number,
          );
          return (
            <EpicColumns
              main={
                <Flex direction="column" gap="3">
                  <Flex justify="between" align="start" gap="3">
                    <Flex direction="column" gap="1">
                      <Flex align="center" gap="2">
                        <Text as="h3" variant="title-small">
                          {planPull.title}
                        </Text>
                        <Badge size="small">
                          {planPull.draft ? 'Draft' : 'In review'}
                        </Badge>
                      </Flex>
                      <Text variant="body-small" color="secondary">
                        <Link
                          href={`https://github.com/${repo}/pull/${planPull.number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {repo}#{planPull.number}
                        </Link>
                        {planPull.author && ` by ${planPull.author}`}
                        {updated && ` · updated ${updated}`}
                      </Text>
                    </Flex>
                    {pullLink && (
                      <ButtonLink
                        href={`${pullLink({ number: String(planPull.number) })}?repo=${encodeURIComponent(repo)}`}
                        variant="tertiary"
                        size="small"
                      >
                        Review page
                      </ButtonLink>
                    )}
                  </Flex>
                  {reader}
                </Flex>
              }
              rail={
                <EpicRail
                  top={
                    <InfoCard title="Plan documents">
                      {nav}
                      {others.length > 0 && (
                        <Flex direction="column" gap="1" mt="3">
                          <Text variant="body-small" color="secondary">
                            Other plans for this epic
                          </Text>
                          {others.map(other => (
                            <Link
                              key={`${other.repo}#${other.number}`}
                              href={`${epic.base}/plan?pr=${other.number}`}
                            >
                              {other.title}
                            </Link>
                          ))}
                        </Flex>
                      )}
                    </InfoCard>
                  }
                />
              }
            />
          );
        }}
      </PlanReview>
    );
  }

  return (
    <EpicColumns
      main={
        merged ? (
          <MergedPlan {...merged} />
        ) : (
          <EmptyStateCard
            title="No plan yet"
            description="A plan names this epic in its Epic header. Once one is proposed, it is reviewed here, next to the epic it changes."
            actions={
              <ButtonLink href={nowLink?.() ?? '/hive'} variant="secondary">
                Plans to grill and review
              </ButtonLink>
            }
          />
        )
      }
    />
  );
}
