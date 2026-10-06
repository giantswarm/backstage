import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Grid,
  Link,
  List,
  ListRow,
  Row,
  Table,
  Tag,
  TagGroup,
  Text,
  ToggleButton,
  ToggleButtonGroup,
  useTable,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  DataBar,
  DateComponent,
  InfoCard,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import { useHiveNow, useHiveSearch, useHiveTeam } from '../../hooks/useHive';
import {
  cardHref,
  linkTarget,
  HIVE_LANE_PREVIEW,
  matchesSearch,
  sortPlansByNeed,
  statusIntent,
  statusText,
  teamName,
} from '../../lib/hive';
import { laneAnchor } from '../../lib/epic';
import {
  Lane,
  MagazineCard,
  PLAN_STATE_LABELS,
  PlanCard,
  progressPercent,
  sortLanes,
} from '../../lib/magazine';
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
  // The side column stays in view while the epics scroll past.
  rail: {
    position: 'sticky',
    top: 'var(--bui-space-4)',
  },
  // Narrow screens scroll the table sideways instead of crushing it.
  scroll: {
    overflowX: 'auto',
    '& > *': {
      minWidth: 860,
    },
  },
  // A lane's heading row: a band across the table, the lane's name and count.
  laneRow: {
    '&&': {
      backgroundColor: 'var(--bui-bg-neutral-2)',
    },
  },
  board: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 'var(--bui-space-4)',
    alignItems: 'start',
  },
  summary: {
    margin: 0,
    paddingLeft: 'var(--bui-space-5)',
  },
});

const VIEWS = ['list', 'board'] as const;
type NowView = (typeof VIEWS)[number];

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

function EpicStatus(props: { card: MagazineCard }) {
  const { card } = props;
  return (
    <StatusLabel
      label={card.blocker ? 'Blocked' : statusText(card.status)}
      intent={statusIntent(card.status, Boolean(card.blocker))}
      title={card.blocker?.reason}
    />
  );
}

function PlanBadge(props: { plan?: PlanCard }) {
  if (!props.plan) {
    return null;
  }
  return <Badge size="small">{PLAN_STATE_LABELS[props.plan.state]}</Badge>;
}

/** A table row: an epic, or the heading of the lane the next epics are in. */
type NowRow =
  | (MagazineCard & { id: string; heading?: undefined })
  | { id: string; heading: Lane; shown: number; matching: number };

const COLUMNS: ColumnConfig<NowRow>[] = [
  {
    id: 'status',
    label: 'Status',
    width: '11%',
    cell: row =>
      row.heading ? (
        <Cell />
      ) : (
        <Cell>
          <EpicStatus card={row} />
        </Cell>
      ),
  },
  {
    id: 'title',
    label: 'Epic',
    isRowHeader: true,
    cell: row =>
      row.heading ? (
        <Cell />
      ) : (
        <CellText
          title={row.title}
          description={row.teaser}
          href={cardHref(row)}
        />
      ),
  },
  {
    id: 'customers',
    label: 'Customers',
    width: '12%',
    cell: row => (
      <Cell>
        {!row.heading && row.customers.length > 0 && (
          <TagGroup aria-label="Customers">
            {row.customers.map(customer => (
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
    width: '8%',
    cell: row => (
      <Cell>{!row.heading && <People names={row.assignees} />}</Cell>
    ),
  },
  {
    id: 'progress',
    label: 'Done',
    width: '9%',
    cell: row => (
      <Cell>
        {!row.heading && row.progress && row.progress.total > 0 ? (
          <DataBar
            label={`${row.progress.done} of ${row.progress.total}`}
            value={progressPercent(row.progress)}
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
    width: '9%',
    cell: row => (
      <Cell>
        {!row.heading && <DateComponent value={row.updatedAt} relative />}
      </Cell>
    ),
  },
  {
    id: 'plan',
    label: 'Plan',
    width: '10%',
    cell: row => <Cell>{!row.heading && <PlanBadge plan={row.plan} />}</Cell>,
  },
];

/** The lanes' epics, in the order Now reads: lane, then latest movement. */
function laneCards(lane: Lane, query: string): MagazineCard[] {
  return lane.cards
    .filter(card =>
      matchesSearch(query, [card.title, card.teaser, ...card.customers]),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Every epic in one bui table, grouped by lane: a heading row per lane
 * (Customers, Top epics, Setup, Chores), then its epics by latest movement.
 * Each lane shows five until "Show all".
 */
function EpicTable(props: { lanes: Lane[]; query: string }) {
  const { lanes, query } = props;
  const classes = useStyles();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const all: NowRow[] = [];
    for (const lane of lanes) {
      const matching = laneCards(lane, query);
      if (query && matching.length === 0) {
        continue;
      }
      const shown =
        query || expanded.has(lane.id)
          ? matching
          : matching.slice(0, HIVE_LANE_PREVIEW);
      all.push({
        id: `lane:${lane.id}`,
        heading: lane,
        shown: shown.length,
        matching: matching.length,
      });
      all.push(...shown.map(card => ({ ...card, id: card.key })));
    }
    return all;
  }, [lanes, query, expanded]);

  const { tableProps } = useTable<NowRow>({
    mode: 'complete',
    data: rows,
    paginationOptions: { type: 'none' },
  });

  const toggle = (laneId: string) =>
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(laneId)) {
        next.delete(laneId);
      } else {
        next.add(laneId);
      }
      return next;
    });

  return (
    <div className={classes.scroll}>
      <Table<NowRow>
        {...tableProps}
        columnConfig={COLUMNS}
        rowConfig={({ item }) =>
          item.heading ? (
            <Row id={item.id} className={classes.laneRow}>
              <Cell colSpan={COLUMNS.length}>
                <Flex
                  id={laneAnchor(item.heading)}
                  justify="between"
                  align="center"
                  gap="3"
                >
                  <Flex align="baseline" gap="3">
                    <Text as="h3" variant="body-medium" weight="bold">
                      {item.heading.title}
                    </Text>
                    <Text variant="body-small" color="secondary">
                      {item.heading.summary}
                    </Text>
                  </Flex>
                  <Flex align="center" gap="2">
                    <Text variant="body-small" color="secondary">
                      {query
                        ? `${item.matching} of ${item.heading.total}`
                        : `${item.heading.total} open`}
                    </Text>
                    {!query && item.matching > HIVE_LANE_PREVIEW && (
                      <Button
                        variant="tertiary"
                        size="small"
                        onPress={() => toggle(item.heading.id)}
                      >
                        {expanded.has(item.heading.id)
                          ? 'Show fewer'
                          : `Show all ${item.matching}`}
                      </Button>
                    )}
                  </Flex>
                </Flex>
              </Cell>
            </Row>
          ) : (
            <Row id={item.id} columns={COLUMNS}>
              {column => column.cell(item)}
            </Row>
          )
        }
        emptyState={
          <Text variant="body-medium" color="secondary">
            {query ? 'No epic matches the search.' : 'Nothing open.'}
          </Text>
        }
      />
    </div>
  );
}

/** Board columns of the Now view, by the status an epic reads with. */
const BOARD_COLUMNS = [
  {
    id: 'next',
    label: 'Up next',
    match: (s: string) => !/progress|validation|done/i.test(s),
  },
  {
    id: 'progress',
    label: 'In progress',
    match: (s: string) => /progress/i.test(s),
  },
  {
    id: 'validation',
    label: 'Validation',
    match: (s: string) => /validation|done/i.test(s),
  },
];

function EpicCard(props: { card: MagazineCard; lane: Lane }) {
  const { card, lane } = props;
  return (
    <Card href={cardHref(card)} label={card.title}>
      <CardBody>
        <Flex direction="column" gap="2">
          <Flex justify="between" align="center" gap="2">
            <EpicStatus card={card} />
            <Text variant="body-x-small" color="secondary">
              {lane.title}
            </Text>
          </Flex>
          <Text variant="body-medium" weight="bold">
            {card.title}
          </Text>
          <Text variant="body-small" color="secondary">
            {card.teaser}
          </Text>
          {card.progress && card.progress.total > 0 && (
            <DataBar
              label={`${card.progress.done} of ${card.progress.total}`}
              value={progressPercent(card.progress)}
              max={100}
              color="var(--bui-fg-announcement)"
            />
          )}
          <Flex justify="between" align="center" gap="2">
            <People names={card.assignees} />
            <Flex align="center" gap="2">
              {card.customers.map(customer => (
                <Badge key={customer} size="small">
                  {customer}
                </Badge>
              ))}
              <PlanBadge plan={card.plan} />
            </Flex>
          </Flex>
        </Flex>
      </CardBody>
    </Card>
  );
}

/** The same epics as cards in status columns, lane order kept inside each. */
function EpicBoard(props: { lanes: Lane[]; query: string }) {
  const classes = useStyles();
  const cards = props.lanes.flatMap(lane =>
    laneCards(lane, props.query).map(card => ({ card, lane })),
  );
  return (
    <div className={classes.board}>
      {BOARD_COLUMNS.map(column => {
        const inColumn = cards.filter(({ card }) =>
          column.match(statusText(card.status)),
        );
        return (
          <section key={column.id} aria-label={column.label}>
            <Flex direction="column" gap="3">
              <Flex justify="between" align="center">
                <Text as="h3" variant="body-medium" weight="bold">
                  {column.label}
                </Text>
                <Text variant="body-small" color="secondary">
                  {inColumn.length}
                </Text>
              </Flex>
              {inColumn.map(({ card, lane }) => (
                <EpicCard key={card.key} card={card} lane={lane} />
              ))}
            </Flex>
          </section>
        );
      })}
    </div>
  );
}

function NeedsYou(props: { plans: PlanCard[]; blocked: MagazineCard[] }) {
  const plans = sortPlansByNeed(props.plans).filter(
    plan => plan.state !== 'merged',
  );
  return (
    <InfoCard title="Needs you">
      <Flex direction="column" gap="3">
        {props.blocked.map(card => (
          <Alert
            key={card.key}
            status="warning"
            icon
            title={<Link href={cardHref(card)}>{card.title}</Link>}
            description={
              <>
                {card.blocker?.reason}
                {card.blocker?.since && (
                  <>
                    {' · since '}
                    <DateComponent value={card.blocker.since} relative />
                  </>
                )}
              </>
            }
          />
        ))}
        {plans.length === 0 ? (
          <Text variant="body-small" color="secondary">
            No plan waits on the team.
          </Text>
        ) : (
          <List aria-label="Plans to grill and review">
            {plans.map(plan => {
              const href = plan.portalPath ?? plan.url;
              return (
                <ListRow
                  key={plan.key}
                  id={plan.key}
                  textValue={plan.title}
                  description={`${PLAN_STATE_LABELS[plan.state]} · ${
                    plan.openQuestion ??
                    (plan.epic ? plan.epic.title : 'No epic yet')
                  }`}
                >
                  <Link href={href} {...linkTarget(href)}>
                    {plan.title}
                  </Link>
                </ListRow>
              );
            })}
          </List>
        )}
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
            <Link href={cardHref(card)} {...linkTarget(cardHref(card))}>
              {card.title}
            </Link>
          </ListRow>
        ))}
      </List>
    </InfoCard>
  );
}

/**
 * Now: the team's epics as one briefing, grouped by lane (customers, top
 * epics, setup, chores) and by latest movement, every row opening its epic
 * page; List | Board shows the same set as a table or in status columns.
 * Beside it what waits on someone and what other teams start next.
 */
export function HiveNowTab() {
  const classes = useStyles();
  const [team] = useHiveTeam();
  const [query] = useHiveSearch();
  const [searchParams, setSearchParams] = useSearchParams();
  const view: NowView = searchParams.get('view') === 'board' ? 'board' : 'list';
  const { data: now, isLoading, error } = useHiveNow(team);

  if (!now) {
    return (
      <HiveSourceState
        isLoading={isLoading}
        error={error}
        what="what the team works on now"
      />
    );
  }

  const lanes = sortLanes(now.lanes);
  const open = lanes.reduce((sum, lane) => sum + lane.total, 0);

  const setView = (next: NowView) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'list') {
      params.delete('view');
    } else {
      params.set('view', next);
    }
    setSearchParams(params, { replace: true });
  };

  return (
    <Grid.Root columns={{ initial: '1', lg: '12' }} gap="6">
      <Grid.Item colSpan={{ initial: '1', lg: '9' }}>
        <Flex direction="column" gap="4">
          {now.summary.length > 0 && (
            <ul className={classes.summary} aria-label="Summary">
              {now.summary.map(line => (
                <li key={line}>
                  <Text variant="body-medium">{line}</Text>
                </li>
              ))}
            </ul>
          )}
          <Flex justify="between" align="center" gap="3">
            <ToggleButtonGroup
              aria-label="View"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[view]}
              onSelectionChange={keys => {
                const next = [...keys][0];
                if (next === 'list' || next === 'board') {
                  setView(next);
                }
              }}
            >
              <ToggleButton id="list">List</ToggleButton>
              <ToggleButton id="board">Board</ToggleButton>
            </ToggleButtonGroup>
            <Text variant="body-small" color="secondary">
              {open} open · {now.blocked.length} blocked · updated{' '}
              <DateComponent value={now.generatedAt} relative />
            </Text>
          </Flex>
          {view === 'list' ? (
            <EpicTable lanes={lanes} query={query} />
          ) : (
            <EpicBoard lanes={lanes} query={query} />
          )}
        </Flex>
      </Grid.Item>
      <Grid.Item colSpan={{ initial: '1', lg: '3' }}>
        <div className={classes.rail}>
          <Flex direction="column" gap="4">
            <NeedsYou plans={now.reviews} blocked={now.blocked} />
            <OtherTeams cards={now.upcoming} />
          </Flex>
        </div>
      </Grid.Item>
    </Grid.Root>
  );
}
