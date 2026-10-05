import { Fragment } from 'react';
import { Card, CardBody, Flex, Link, Text } from '@backstage/ui';
import { formatDate } from '../../lib/dates';
import {
  MagazineCard,
  MagazineLink,
  PLAN_STATE_LABELS,
  PlanCard,
  Ref,
} from '../../lib/magazine';
import {
  Callout,
  CustomerTags,
  LinkRow,
  MagazineLinkItem,
  ProgressLine,
  StatusChip,
} from './parts';

const external = { target: '_blank', rel: 'noopener noreferrer' };

/** Rock › Epic, the card's place in the bigger picture. */
function Breadcrumb(props: { trail: (Ref | string)[] }) {
  if (props.trail.length === 0) {
    return null;
  }
  return (
    <Text as="div" variant="body-small" color="secondary">
      {props.trail.map((step, i) => (
        <Fragment key={typeof step === 'string' ? step : step.key}>
          {i > 0 && ' › '}
          {typeof step === 'string' ? (
            step
          ) : (
            <Link href={step.url} variant="body-small" {...external}>
              {step.title}
            </Link>
          )}
        </Fragment>
      ))}
    </Text>
  );
}

/** The links of a card: issue, epic, plan, PRs and the rest, in that order. */
function cardLinks(card: MagazineCard): MagazineLink[] {
  const links: MagazineLink[] = [
    { label: card.kind === 'epic' ? 'Epic' : 'Issue', url: card.url },
  ];
  if (card.epic && card.epic.url !== card.url) {
    links.push({ label: 'Epic', url: card.epic.url });
  }
  if (card.plan) {
    links.push({
      label: 'Plan',
      url: card.plan.portalPath ?? card.plan.url,
    });
  }
  return [...links, ...card.links];
}

/**
 * One item of the magazine, in the fixed anatomy: status and title, its
 * place under rock and epic, the teaser, progress, customers, the blocker,
 * and the links with "Try it" last.
 */
export function MagazineItemCard(props: { card: MagazineCard }) {
  const { card } = props;
  const trail: (Ref | string)[] = [
    ...(card.rock ? [card.rock] : []),
    ...(card.epic && card.epic.url !== card.url ? [card.epic] : []),
    ...(!card.rock && !card.epic && card.area ? [card.area] : []),
  ];
  return (
    <Card>
      <CardBody>
        <Flex direction="column" gap="2">
          <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
            {card.status && <StatusChip label={card.status} />}
            {card.team && (
              <Text variant="body-small" color="secondary">
                {card.team}
              </Text>
            )}
          </Flex>
          <Text as="h4" variant="title-x-small">
            <Link href={card.url} {...external}>
              {card.title}
            </Link>
          </Text>
          <Breadcrumb trail={trail} />
          <Text as="p" variant="body-medium">
            {card.teaser}
          </Text>
          {card.progress && card.progress.total > 0 && (
            <ProgressLine progress={card.progress} />
          )}
          <CustomerTags customers={card.customers} />
          {card.blocker && (
            <Callout title="Blocked">
              {card.blocker.reason}
              {card.blocker.owner && ` · on ${card.blocker.owner}`}
              {card.blocker.since &&
                ` · since ${formatDate(card.blocker.since) ?? card.blocker.since}`}
            </Callout>
          )}
          <LinkRow links={cardLinks(card)} tryIt={card.tryIt} />
        </Flex>
      </CardBody>
    </Card>
  );
}

/** A plan waiting for its grilling or review, with the open decision. */
export function PlanReviewCard(props: { plan: PlanCard }) {
  const { plan } = props;
  return (
    <Card>
      <CardBody>
        <Flex direction="column" gap="2">
          <Flex gap="2" align="center">
            <StatusChip
              label={PLAN_STATE_LABELS[plan.state]}
              tone={plan.state === 'merged' ? 'success' : 'warning'}
            />
            <Text variant="body-small" color="secondary">
              {formatDate(plan.updatedAt)}
            </Text>
          </Flex>
          <Text as="h4" variant="title-x-small">
            <Link href={plan.url} {...external}>
              {plan.title}
            </Link>
          </Text>
          {plan.epic && <Breadcrumb trail={[plan.epic]} />}
          {plan.openQuestion && (
            <Text as="p" variant="body-medium">
              Open question: {plan.openQuestion}
            </Text>
          )}
          {plan.portalPath && (
            <div>
              <MagazineLinkItem
                link={{ label: 'Review in the portal', url: plan.portalPath }}
                variant="button"
              />
            </div>
          )}
        </Flex>
      </CardBody>
    </Card>
  );
}
