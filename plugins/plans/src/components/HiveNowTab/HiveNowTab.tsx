import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Grid,
  Link,
  List,
  ListRow,
  Table,
  Tag,
  TagGroup,
  Text,
  useTable,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  DataBar,
  DateComponent,
  InfoCard,
  SectionHeader,
  Stat,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import { useHiveNow, useHiveSearch, useHiveTeam } from '../../hooks/useHive';
import {
  ALL_TEAMS,
  cardHref,
  linkTarget,
  HIVE_LANE_PREVIEW,
  matchesSearch,
  nowFigures,
  sortPlansByNeed,
  statusIntent,
  statusText,
  teamName,
} from '../../lib/hive';
import {
  Lane,
  MagazineCard,
  PLAN_STATE_LABELS,
  PlanCard,
  progressPercent,
  sortLanes,
} from '../../lib/magazine';
import { HiveScopeNote } from '../HiveScopeNote';
import { HiveSourceState } from '../HiveSourceState';

const useStyles = makeStyles({
  // Overlapping avatars, the first on top, like the catalog's owner stacks.
  people: {
    display: 'flex',
    '& > *': {
      boxShadow: '0 0 0 2px var(--bui-bg-neutral-1)',
      borderRadius: '50%',
    },
    '& > * + *': {
      marginLeft: 'calc(-1 * var(--bui-space-1_5, 6px))',
    },
  },
  // The side column stays in view while the lanes scroll past.
  rail: {
    position: 'sticky',
    top: 'var(--bui-space-4)',
  },
  // Narrow screens scroll a lane sideways instead of crushing its columns.
  scroll: {
    overflowX: 'auto',
    '& > *': {
      minWidth: 720,
    },
  },
  summary: {
    margin: 0,
    paddingLeft: 'var(--bui-space-5)',
  },
});

function People(props: { names: string[] }) {
  const classes = useStyles();
  if (props.names.length === 0) {
    return (
      <Text variant="body-small" color="secondary" title="Unassigned">
        —
      </Text>
    );
  }
  return (
    <div className={classes.people} title={props.names.join(', ')}>
      {props.names.map(name => (
        // No photo for fixture people; bui falls back to the initials.
        <Avatar key={name} src="" name={name} size="small" />
      ))}
    </div>
  );
}

/** A lane's card as a table row: bui rows are keyed by `id`. */
type LaneRow = MagazineCard & { id: string };

function laneColumns(lane: Lane): ColumnConfig<LaneRow>[] {
  const hasCustomers = lane.cards.some(card => card.customers.length > 0);
  const hasProgress = lane.cards.some(card => card.progress);
  const columns: (ColumnConfig<LaneRow> | false)[] = [
    {
      id: 'status',
      label: 'Status',
      width: '14%',
      cell: card => (
        <Cell>
          <StatusLabel
            label={card.blocker ? 'Blocked' : statusText(card.status)}
            intent={statusIntent(card.status, Boolean(card.blocker))}
            title={card.blocker?.reason}
          />
        </Cell>
      ),
    },
    {
      id: 'title',
      label: lane.id === 'chore' ? 'Issue' : 'Epic',
      isRowHeader: true,
      cell: card => (
        <CellText
          title={card.title}
          description={card.teaser}
          href={cardHref(card)}
        />
      ),
    },
    hasCustomers && {
      id: 'customers',
      label: 'Customers',
      width: '16%',
      cell: card => (
        <Cell>
          {card.customers.length > 0 && (
            <TagGroup aria-label="Customers">
              {card.customers.map(customer => (
                <Tag key={customer} id={customer} size="small">
                  {customer}
                </Tag>
              ))}
            </TagGroup>
          )}
        </Cell>
      ),
    },
    {
      id: 'people',
      label: 'People',
      width: '9%',
      cell: card => (
        <Cell>
          <People names={card.assignees} />
        </Cell>
      ),
    },
    hasProgress && {
      id: 'progress',
      label: 'Done',
      width: '11%',
      cell: card => (
        <Cell>
          {card.progress && card.progress.total > 0 ? (
            <DataBar
              label={`${card.progress.done} of ${card.progress.total}`}
              value={progressPercent(card.progress)}
              max={100}
              color="var(--bui-fg-announcement)"
            />
          ) : null}
        </Cell>
      ),
    },
    {
      id: 'updatedAt',
      label: 'Moved',
      width: '12%',
      cell: card => (
        <Cell>
          <DateComponent value={card.updatedAt} relative />
        </Cell>
      ),
    },
  ];
  return columns.filter((column): column is ColumnConfig<LaneRow> =>
    Boolean(column),
  );
}

function LaneTable(props: { lane: Lane; query: string }) {
  const { lane, query } = props;
  const classes = useStyles();
  const [expanded, setExpanded] = useState(false);
  const matching = useMemo(
    () =>
      lane.cards.filter(card =>
        matchesSearch(query, [card.title, card.teaser, ...card.customers]),
      ),
    [lane.cards, query],
  );
  const rows: LaneRow[] = (
    expanded || query ? matching : matching.slice(0, HIVE_LANE_PREVIEW)
  ).map(card => ({ ...card, id: card.key }));
  const columnConfig = useMemo(() => laneColumns(lane), [lane]);
  const { tableProps } = useTable<LaneRow>({
    mode: 'complete',
    data: rows,
    paginationOptions: { type: 'none' },
  });

  return (
    <section aria-labelledby={`hive-lane-${lane.id}`}>
      <Flex justify="between" align="end" gap="3" mb="3">
        <SectionHeader
          id={`hive-lane-${lane.id}`}
          title={lane.title}
          description={lane.summary}
        />
        <Text variant="body-small" color="secondary">
          {query ? `${matching.length} of ${lane.total}` : `${lane.total} open`}
        </Text>
      </Flex>
      <div className={classes.scroll}>
        <Table<LaneRow>
          {...tableProps}
          columnConfig={columnConfig}
          emptyState={
            <Text variant="body-medium" color="secondary">
              {query ? 'Nothing here matches the search.' : 'Nothing open.'}
            </Text>
          }
        />
      </div>
      {!query && matching.length > HIVE_LANE_PREVIEW && (
        <Flex justify="center" mt="2">
          <Button
            variant="tertiary"
            size="small"
            onPress={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show fewer' : `Show all ${matching.length}`}
          </Button>
        </Flex>
      )}
    </section>
  );
}

function PlansToReview(props: { plans: PlanCard[] }) {
  const plans = sortPlansByNeed(props.plans).filter(
    plan => plan.state !== 'merged',
  );
  return (
    <InfoCard title="Plans to grill and review">
      {plans.length === 0 ? (
        <Text variant="body-small" color="secondary">
          No plan waits on the team.
        </Text>
      ) : (
        <List aria-label="Plans to grill and review">
          {plans.map(plan => (
            <ListRow
              key={plan.key}
              id={plan.key}
              textValue={plan.title}
              description={plan.openQuestion ?? plan.epic?.title}
              customActions={
                <Badge size="small">{PLAN_STATE_LABELS[plan.state]}</Badge>
              }
            >
              <Link href={plan.url} {...linkTarget(plan.url)}>
                {plan.title}
              </Link>
            </ListRow>
          ))}
        </List>
      )}
    </InfoCard>
  );
}

function Blocked(props: { cards: MagazineCard[] }) {
  if (props.cards.length === 0) {
    return null;
  }
  return (
    <InfoCard title="Blocked">
      <Flex direction="column" gap="2">
        {props.cards.map(card => (
          <Alert
            key={card.key}
            status="warning"
            icon
            title={
              <Link href={cardHref(card)} {...linkTarget(cardHref(card))}>
                {card.title}
              </Link>
            }
            description={
              <>
                {card.blocker?.reason}
                {card.blocker?.since && (
                  <>
                    {' · since '}
                    <DateComponent value={card.blocker.since} relative />
                  </>
                )}
                {card.blocker?.owner && ` · ${card.blocker.owner}`}
              </>
            }
          />
        ))}
      </Flex>
    </InfoCard>
  );
}

function OtherTeams(props: { cards: MagazineCard[] }) {
  if (props.cards.length === 0) {
    return null;
  }
  return (
    <InfoCard title="Other teams, coming up">
      <List aria-label="Other teams, coming up">
        {props.cards.map(card => (
          <ListRow
            key={card.key}
            id={card.key}
            textValue={card.title}
            description={`${teamName(card.team ?? '')} · ${statusText(card.status)}`}
            icon={
              <Avatar src="" name={teamName(card.team ?? '')} size="small" />
            }
          >
            <Link href={card.url} {...linkTarget(card.url)}>
              {card.title}
            </Link>
          </ListRow>
        ))}
      </List>
    </InfoCard>
  );
}

function FigureCard(props: {
  label: string;
  value: number;
  hint: string;
  tone?: 'warning';
}) {
  return (
    <InfoCard>
      <Stat
        label={props.label}
        value={props.value}
        hint={props.hint}
        tone={props.value > 0 ? props.tone : undefined}
      />
    </InfoCard>
  );
}

/**
 * Now: the team's open work ranked customers first, then the top epics,
 * setup and chores, one table per lane; beside it what waits on someone —
 * plans to review, blockers — and what other teams start next.
 */
export function HiveNowTab() {
  const classes = useStyles();
  const [team] = useHiveTeam();
  const [query] = useHiveSearch();
  const { data, isLoading, isFetching, error, refetch } = useHiveNow(team);

  if (!data) {
    return (
      <HiveSourceState
        isLoading={isLoading}
        error={error}
        what="what the team works on now"
        onRetry={refetch}
        isFetching={isFetching}
      />
    );
  }

  const { view: now, magazineTeam } = data;
  const figures = nowFigures(now);
  const lanes = sortLanes(now.lanes);
  const scope = team === ALL_TEAMS ? 'all teams' : teamName(team);

  return (
    <Flex direction="column" gap="6">
      <HiveScopeNote team={team} magazineTeam={magazineTeam} />
      <Grid.Root columns={{ initial: '2', md: '4' }} gap="3">
        <FigureCard
          label="Open for customers"
          value={figures.customers}
          hint={`Open board items with a customer, ${scope}.`}
        />
        <FigureCard
          label="In progress"
          value={figures.inProgress}
          hint="Items in the In Progress column across every lane."
        />
        <FigureCard
          label="Blocked"
          value={figures.blocked}
          hint="Items with a recorded blocker."
          tone="warning"
        />
        <FigureCard
          label="Plans waiting"
          value={figures.plansWaiting}
          hint="Plans being grilled, drafted or waiting for review."
        />
      </Grid.Root>

      <Grid.Root columns={{ initial: '1', lg: '12' }} gap="6">
        <Grid.Item colSpan={{ initial: '1', lg: '8' }}>
          <Flex direction="column" gap="7">
            {now.summary.length > 0 && (
              <ul className={classes.summary} aria-label="Summary">
                {now.summary.map(line => (
                  <li key={line}>
                    <Text variant="body-medium">{line}</Text>
                  </li>
                ))}
              </ul>
            )}
            {lanes.map(lane => (
              <LaneTable key={lane.id} lane={lane} query={query} />
            ))}
            <Text variant="body-x-small" color="secondary">
              Updated <DateComponent value={now.generatedAt} relative />
            </Text>
          </Flex>
        </Grid.Item>
        <Grid.Item colSpan={{ initial: '1', lg: '4' }}>
          <div className={classes.rail}>
            <Flex direction="column" gap="4">
              <PlansToReview plans={now.reviews} />
              <Blocked cards={now.blocked} />
              <OtherTeams cards={now.upcoming} />
            </Flex>
          </div>
        </Grid.Item>
      </Grid.Root>
    </Flex>
  );
}
