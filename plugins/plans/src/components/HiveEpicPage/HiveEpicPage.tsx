import { ReactNode } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import {
  Badge,
  ButtonLink,
  Container,
  Flex,
  Header,
  HeaderMetadataUsers,
  Link,
  Select,
  Tag,
  TagGroup,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { EmptyState, Progress } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Breadcrumbs,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  STATUS_FIELD,
  useSchema,
  useUpdateItemField,
} from '@giantswarm/backstage-plugin-roadmap';
import { useEpicCard, useEpicItem, useEpicPlans } from '../../hooks/useEpic';
import {
  EPIC_TABS,
  epicPlanState,
  epicTabOf,
  issueKey,
  issueOfItem,
  laneAnchor,
} from '../../lib/epic';
import { statusIntent, statusText } from '../../lib/hive';
import { PLAN_STATE_LABELS } from '../../lib/magazine';
import { epicRouteRef, hiveNowRouteRef } from '../../routes';
import { PlansErrorAlert } from '../PlansErrorAlert';
import { EpicContext, EpicData } from './context';
import { EpicHistoryTab } from './EpicHistoryTab';
import { EpicOverviewTab } from './EpicOverviewTab';
import { EpicPlanTab } from './EpicPlanTab';
import { EpicSubIssuesTab } from './EpicSubIssuesTab';

const useStyles = makeStyles({
  crumbs: {
    paddingTop: 'var(--bui-space-4)',
  },
  status: {
    minWidth: 180,
  },
  // On a phone the title takes its own row above the actions, instead of
  // being squeezed to a letter beside them.
  header: {
    '@media (max-width: 600px)': {
      '&&': {
        flexWrap: 'wrap',
      },
      '&& > :first-child': {
        flexBasis: '100%',
      },
    },
  },
});

/** The header's status control: the board's Status, changed in place. */
function StatusSelect(props: { epic: EpicData }) {
  const { epic } = props;
  const classes = useStyles();
  const schema = useSchema();
  const updateField = useUpdateItemField();
  const options =
    schema.data?.fields.find(field => field.name === STATUS_FIELD)?.options ??
    [];
  const value = epic.fields.get(STATUS_FIELD);
  if (options.length === 0) {
    return null;
  }
  return (
    <div className={classes.status}>
      <Select
        aria-label="Status"
        size="small"
        options={options.map(option => ({ id: option, label: option }))}
        selectedKey={value ?? null}
        isDisabled={updateField.isPending}
        onSelectionChange={key =>
          key &&
          updateField.mutate({
            itemId: epic.id,
            name: STATUS_FIELD,
            value: String(key),
          })
        }
      />
    </div>
  );
}

/**
 * One epic, the unit Hive is built around: what Roadmap, Plans and the
 * magazine know about it on one page. The header carries the status, the
 * customers, the people and the plan state; the tabs (`/hive/epics/:id`,
 * `…/plan`, `…/history`, `…/sub-issues`) hold the description, the plan
 * review, what moved and the sub-issues, beside a rail with the board
 * fields.
 */
export function HiveEpicPage() {
  const classes = useStyles();
  const params = useParams();
  const id = params.id;
  const tab = epicTabOf(params['*'] ?? '');
  const epicLink = useRouteRef(epicRouteRef);
  const nowLink = useRouteRef(hiveNowRouteRef);

  const itemQuery = useEpicItem(id);
  const item = itemQuery.data?.item;
  const issue = item && issueOfItem(item);
  const key = issueKey(issue);
  const { card, lane } = useEpicCard(key);
  const { plans } = useEpicPlans(issue);

  if (itemQuery.isLoading) {
    return (
      <Container>
        <Progress />
      </Container>
    );
  }
  if (itemQuery.error) {
    return (
      <Container>
        <PlansErrorAlert
          title="Failed to load the epic"
          error={itemQuery.error as Error}
        />
      </Container>
    );
  }
  if (!id || !item) {
    return (
      <Container>
        <EmptyState
          missing="content"
          title="Epic not found"
          description="This epic does not exist or was removed from the board."
        />
      </Container>
    );
  }

  const base = epicLink?.({ id }) ?? '.';
  const now = nowLink?.() ?? '/hive';
  const epic: EpicData = {
    id,
    base,
    item,
    issue,
    key,
    card,
    lane,
    plans,
    fields: new Map(item.fields.map(field => [field.name, field.value])),
  };
  const status = epic.fields.get(STATUS_FIELD);
  const planState = epicPlanState(card, plans);
  const people = card?.assignees ?? item.assignees;

  const metadata: { label: string; value: ReactNode }[] = [
    {
      label: 'Status',
      value: (
        <StatusLabel
          label={card?.blocker ? 'Blocked' : statusText(status) || 'No status'}
          intent={statusIntent(status, Boolean(card?.blocker))}
          title={card?.blocker?.reason}
        />
      ),
    },
  ];
  if (card && card.customers.length > 0) {
    metadata.push({
      label: 'Customers',
      value: (
        <TagGroup aria-label="Customers">
          {card.customers.map(customer => (
            <Tag key={customer} id={customer} size="small">
              {customer}
            </Tag>
          ))}
        </TagGroup>
      ),
    });
  }
  if (people.length > 0) {
    metadata.push({
      label: 'People',
      value: <HeaderMetadataUsers users={people.map(name => ({ name }))} />,
    });
  }
  metadata.push({
    label: 'Plan',
    value: planState ? (
      <Link href={`${base}/plan`}>
        <Badge size="small">{PLAN_STATE_LABELS[planState]}</Badge>
      </Link>
    ) : (
      <Text variant="body-medium" color="secondary">
        None yet
      </Text>
    ),
  });

  const crumbs = [
    { label: 'Hive', href: now },
    ...(lane
      ? [{ label: lane.title, href: `${now}#${laneAnchor(lane)}` }]
      : []),
    { label: item.title },
  ];

  return (
    <EpicContext.Provider value={epic}>
      <Container className={classes.crumbs}>
        <Breadcrumbs items={crumbs} />
      </Container>
      <Header
        className={classes.header}
        title={item.title}
        description={card?.teaser}
        metadata={metadata}
        activeTabId={tab}
        tabs={EPIC_TABS.map(entry => ({
          id: entry.id,
          label: entry.label,
          href: entry.segment ? `${base}/${entry.segment}` : base,
        }))}
        customActions={
          <Flex align="center" gap="2">
            <StatusSelect epic={epic} />
            {item.url && (
              <ButtonLink
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="small"
                iconEnd={<OpenInNewIcon fontSize="inherit" />}
              >
                Open in GitHub
              </ButtonLink>
            )}
          </Flex>
        }
      />
      <Container>
        <Routes>
          <Route index element={<EpicOverviewTab />} />
          <Route path="plan" element={<EpicPlanTab />} />
          <Route path="history" element={<EpicHistoryTab />} />
          <Route path="sub-issues" element={<EpicSubIssuesTab />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </Container>
    </EpicContext.Provider>
  );
}
