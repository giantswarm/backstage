import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Flex,
  Link,
  List,
  ListRow,
  Tag,
  TagGroup,
  Text,
} from '@backstage/ui';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  DataBar,
  DetailsDrawer,
  SectionHeader,
} from '@giantswarm/backstage-plugin-ui-react';
import { useHiveDetail, useHiveDetailLinks } from '../../hooks/useHiveDetail';
import { relativeTime } from '../../lib/dates';
import {
  EpicDetail,
  HiveWhen,
  knowledgeDocPath,
  planPull,
} from '../../lib/frontPage';
import { linkTarget, statusIntent, statusText } from '../../lib/hive';
import {
  ENTRY_KIND_LABELS,
  HISTORY_WINDOWS,
  Now,
  PLAN_STATE_LABELS,
  progressLabel,
  progressMoveLabel,
  progressPercent,
} from '../../lib/magazine';
import { roadmapItemExternalRouteRef } from '../../routes';
import { ItemStatus } from './FrontSectionView';

function windowLabel(when: HiveWhen): string {
  return (
    HISTORY_WINDOWS.find(option => option.id === when)?.label ?? '3 weeks'
  ).toLowerCase();
}

/**
 * An epic, opened in place (`?item=<board item id>`): where it stands now,
 * what blocks it, its plan, what moved in the window the page reads (3
 * weeks when it reads now), and the background behind it. The full board
 * item, its fields and sub-issues, stays one link away on the board.
 */
function EpicDetails(props: {
  id: string;
  epic: EpicDetail;
  now?: Now;
  historyWindow: HiveWhen;
}) {
  const { id, epic, now, historyWindow } = props;
  const { card, group } = epic;
  const { itemHref, docHref } = useHiveDetailLinks();
  const boardItem = useRouteRef(roadmapItemExternalRouteRef);

  const title = card?.title ?? group?.title ?? '';
  const teaser = card?.teaser ?? group?.teaser;
  const customers = card?.customers ?? group?.customers ?? [];
  const tryIt = card?.tryIt ?? group?.tryIt;
  const githubUrl = card?.url ?? group?.url;
  const plans = (now?.reviews ?? []).filter(
    plan => card && plan.epic?.key === card.key,
  );
  // The window's move when it has one, else where the epic stands.
  let progress: { label: string; percent: number } | undefined;
  if (group?.progress) {
    progress = {
      label: progressMoveLabel(group.progress),
      percent: progressPercent(group.progress.to),
    };
  } else if (card?.progress) {
    progress = {
      label: progressLabel(card.progress),
      percent: progressPercent(card.progress),
    };
  }
  const docs = (card?.links ?? []).flatMap(link => {
    const path = knowledgeDocPath(link.url);
    return path ? [{ label: link.label, path }] : [];
  });

  return (
    <Flex direction="column" gap="5">
      <Flex direction="column" gap="2">
        <Flex align="center" gap="3">
          {card && (
            <ItemStatus
              status={{
                label: card.blocker ? 'Blocked' : statusText(card.status),
                intent: statusIntent(card.status, Boolean(card.blocker)),
              }}
            />
          )}
          {card?.updatedAt && (
            <Text variant="body-small" color="secondary">
              {`Moved ${relativeTime(card.updatedAt)}`}
            </Text>
          )}
        </Flex>
        <Text as="h2" variant="title-small" weight="bold">
          {title}
        </Text>
        {teaser && (
          <Text as="p" variant="body-large" color="secondary">
            {teaser}
          </Text>
        )}
        {customers.length > 0 && (
          <TagGroup aria-label="Customers">
            {customers.map(customer => (
              <Tag key={customer} id={customer} size="small">
                {customer}
              </Tag>
            ))}
          </TagGroup>
        )}
      </Flex>

      {card?.blocker && (
        <Alert
          status="warning"
          icon
          title={card.blocker.reason}
          description={[
            card.blocker.since && `Since ${relativeTime(card.blocker.since)}`,
            card.blocker.owner,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      )}

      {progress && (
        <DataBar
          label={progress.label}
          value={progress.percent}
          max={100}
          color="var(--bui-fg-announcement)"
        />
      )}

      {card && card.assignees.length > 0 && (
        <Flex direction="column" gap="2">
          <SectionHeader as="h3" variant="title-x-small" title="People" />
          <Flex gap="4" align="center">
            {card.assignees.map(name => (
              <Flex key={name} gap="2" align="center">
                <Avatar src="" name={name} size="small" />
                <Text variant="body-medium">{name}</Text>
              </Flex>
            ))}
          </Flex>
        </Flex>
      )}

      {plans.length > 0 && (
        <Flex direction="column" gap="2">
          <SectionHeader as="h3" variant="title-x-small" title="Plan" />
          <List aria-label="Plan">
            {plans.map(plan => {
              const pull = planPull(plan.url);
              const href = pull ? itemHref({ kind: 'pr', ...pull }) : plan.url;
              return (
                <ListRow
                  key={plan.key}
                  id={plan.key}
                  textValue={plan.title}
                  href={href}
                  {...linkTarget(href)}
                  description={plan.openQuestion}
                  customActions={
                    <Badge size="small">{PLAN_STATE_LABELS[plan.state]}</Badge>
                  }
                >
                  {plan.title}
                </ListRow>
              );
            })}
          </List>
        </Flex>
      )}

      <Flex direction="column" gap="2">
        <SectionHeader
          as="h3"
          variant="title-x-small"
          title={`What moved in ${windowLabel(historyWindow)}`}
        />
        {group && group.entries.length > 0 ? (
          <List aria-label="What moved">
            {group.entries.map(entry => (
              <ListRow
                key={entry.key}
                id={entry.key}
                textValue={entry.title}
                href={entry.url}
                {...linkTarget(entry.url)}
                description={[relativeTime(entry.at), entry.author]
                  .filter(Boolean)
                  .join(' · ')}
                customActions={
                  <Badge size="small">{ENTRY_KIND_LABELS[entry.kind]}</Badge>
                }
              >
                {entry.title}
              </ListRow>
            ))}
          </List>
        ) : (
          <Text variant="body-medium" color="secondary">
            Nothing moved in this window.
          </Text>
        )}
      </Flex>

      {docs.length > 0 && (
        <Flex direction="column" gap="2">
          <SectionHeader as="h3" variant="title-x-small" title="Background" />
          {docs.map(doc => (
            <Link key={doc.path} href={docHref(doc.path)}>
              {doc.label}
            </Link>
          ))}
        </Flex>
      )}

      <Flex gap="2" align="center">
        {tryIt && (
          <ButtonLink href={tryIt.url} variant="primary" size="small">
            {tryIt.label}
          </ButtonLink>
        )}
        {boardItem && (
          <ButtonLink href={boardItem({ id })} variant="secondary" size="small">
            Open on the board
          </ButtonLink>
        )}
        {githubUrl && (
          <ButtonLink
            href={githubUrl}
            variant="tertiary"
            size="small"
            {...linkTarget(githubUrl)}
          >
            GitHub
          </ButtonLink>
        )}
      </Flex>
    </Flex>
  );
}

/** The epic pane over the front page; Escape or the close button shuts it. */
export function EpicPane(props: {
  epic: EpicDetail;
  now?: Now;
  historyWindow: HiveWhen;
}) {
  const { item, close } = useHiveDetail();
  const found = Boolean(props.epic.card || props.epic.group);
  return (
    <DetailsDrawer open={Boolean(item)} onClose={close}>
      {item &&
        (found ? (
          <EpicDetails id={item} {...props} />
        ) : (
          <Text as="p" color="secondary">
            This epic is not on the front page for this team and time.
          </Text>
        ))}
    </DetailsDrawer>
  );
}
