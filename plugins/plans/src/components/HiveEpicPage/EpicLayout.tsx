import { ReactNode } from 'react';
import { Badge, Flex, Link, List, ListRow, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  DateComponent,
  FactList,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  FieldEditor,
  useSchema,
  useUpdateItemField,
} from '@giantswarm/backstage-plugin-roadmap';
import { useEpicHistory } from '../../hooks/useEpic';
import {
  ENTRY_KIND_LABELS,
  PLAN_STATE_LABELS,
  shortDay,
} from '../../lib/magazine';
import { epicPlanState } from '../../lib/epic';
import { linkTarget } from '../../lib/hive';
import { useEpic } from './context';

const READING_WIDTH = 860;
const RAIL_WIDTH = 300;

const useStyles = makeStyles({
  columns: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--bui-space-6)',
    paddingBottom: 'var(--bui-space-8)',
    '@media (max-width: 1100px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
  },
  main: {
    flex: '1 1 auto',
    maxWidth: READING_WIDTH,
    minWidth: 0,
  },
  // The rail stays in view while the reading column scrolls past.
  rail: {
    width: RAIL_WIDTH,
    flexShrink: 0,
    position: 'sticky',
    top: 'var(--bui-space-4)',
    '@media (max-width: 1100px)': {
      width: 'auto',
      position: 'static',
    },
  },
});

/** The board fields Hive edits in the rail; Status sits in the header. */
const RAIL_FIELDS = ['Team', 'Kind', 'Quarter', 'Availability'];

function BoardFields() {
  const epic = useEpic();
  const schema = useSchema();
  const updateField = useUpdateItemField();
  const fields = (schema.data?.fields ?? []).filter(field =>
    RAIL_FIELDS.includes(field.name),
  );
  const { item } = epic;
  return (
    <InfoCard title="Board fields">
      <FactList
        maxWidth={null}
        labelWidth={90}
        facts={[
          {
            label: 'Issue',
            value: item.url ? (
              <Link href={item.url} {...linkTarget(item.url)}>
                {item.repository?.nameWithOwner.split('/')[1]}#{item.number}
              </Link>
            ) : (
              'Draft item'
            ),
          },
          ...(item.createdAt
            ? [
                {
                  label: 'Opened',
                  value: <DateComponent value={item.createdAt} relative />,
                },
              ]
            : []),
          ...(item.updatedAt
            ? [
                {
                  label: 'Updated',
                  value: <DateComponent value={item.updatedAt} relative />,
                },
              ]
            : []),
        ]}
      />
      {fields.map(field => (
        <FieldEditor
          key={field.name}
          field={field}
          value={epic.fields.get(field.name)}
          disabled={updateField.isPending}
          onChange={value =>
            updateField.mutate({ itemId: epic.id, name: field.name, value })
          }
        />
      ))}
    </InfoCard>
  );
}

function PlanSummary() {
  const epic = useEpic();
  const state = epicPlanState(epic.card, epic.plans);
  const pull = epic.plans.pulls[0];
  const merged = epic.plans.merged[0];
  return (
    <InfoCard
      title="Plan"
      headerActions={
        state && <Badge size="small">{PLAN_STATE_LABELS[state]}</Badge>
      }
    >
      {pull || merged ? (
        <Flex direction="column" gap="1">
          <Link href={`${epic.base}/plan`}>
            {pull ? pull.title : merged.folder}
          </Link>
          <Text variant="body-small" color="secondary">
            {pull ? `${pull.repo}#${pull.number}` : `Merged in ${merged.repo}`}
          </Text>
        </Flex>
      ) : (
        <Text variant="body-small" color="secondary">
          No plan names this epic yet.
        </Text>
      )}
    </InfoCard>
  );
}

function LatestMovement() {
  const epic = useEpic();
  const { group } = useEpicHistory('months', epic.key);
  const latest = [...(group?.entries ?? [])]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);
  return (
    <InfoCard title="Latest movement">
      {latest.length === 0 ? (
        <Text variant="body-small" color="secondary">
          Nothing moved in the last 3 months.
        </Text>
      ) : (
        <List aria-label="Latest movement">
          {latest.map(entry => (
            <ListRow
              key={entry.key}
              id={entry.key}
              textValue={entry.title}
              description={`${ENTRY_KIND_LABELS[entry.kind]} · ${shortDay(entry.at)}`}
            >
              <Link href={entry.url} {...linkTarget(entry.url)}>
                {entry.title}
              </Link>
            </ListRow>
          ))}
        </List>
      )}
    </InfoCard>
  );
}

/**
 * The epic's rail: the board fields to edit, the plan's state and the last
 * three movements. A tab puts its own card on top: the Plan tab its
 * documents, in place of the plan summary.
 */
export function EpicRail(props: { top?: ReactNode }) {
  return (
    <Flex direction="column" gap="4">
      {props.top ?? <PlanSummary />}
      <BoardFields />
      <LatestMovement />
    </Flex>
  );
}

/** The epic page's two columns: an 860 px reading column and the rail. */
export function EpicColumns(props: { main: ReactNode; rail?: ReactNode }) {
  const classes = useStyles();
  return (
    <div className={classes.columns}>
      <div className={classes.main}>{props.main}</div>
      <aside className={classes.rail} aria-label="About this epic">
        {props.rail ?? <EpicRail />}
      </aside>
    </div>
  );
}
