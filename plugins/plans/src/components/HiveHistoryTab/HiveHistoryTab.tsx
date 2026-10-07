import {
  Badge,
  ButtonLink,
  Flex,
  Grid,
  Link,
  List,
  ListRow,
  Tag,
  TagGroup,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  DataBar,
  InfoCard,
  SectionHeader,
  SimpleAccordion,
  Stat,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  useHiveHistory,
  useHiveSearch,
  useHiveTeam,
} from '../../hooks/useHive';
import { formatDate } from '../../lib/dates';
import { followsTeam, linkTarget, matchesSearch } from '../../lib/hive';
import {
  ENTRY_KIND_LABELS,
  Group,
  History,
  progressMoveLabel,
  progressPercent,
  shortDay,
} from '../../lib/magazine';
import { HiveScopeNote } from '../HiveScopeNote';
import { HiveSourceState } from '../HiveSourceState';

const useStyles = makeStyles({
  summary: {
    margin: 0,
    paddingLeft: 'var(--bui-space-5)',
  },
  // Generated teasers carry links, paths and commands without a break.
  wrap: {
    overflowWrap: 'anywhere',
  },
});

const GROUP_KIND_LABELS: Record<Group['kind'], string> = {
  epic: 'Epic',
  area: 'Area',
  other: 'Other',
};

/** One epic or area: what it is, how far it moved, the stories that moved it. */
function GroupCard(props: { group: Group }) {
  const { group } = props;
  const classes = useStyles();
  const stories = group.entries.length;
  return (
    <InfoCard
      title={
        group.url ? (
          <Link href={group.url} {...linkTarget(group.url)}>
            {group.title}
          </Link>
        ) : (
          group.title
        )
      }
      headerActions={
        group.tryIt && (
          <ButtonLink href={group.tryIt.url} variant="secondary" size="small">
            {group.tryIt.label}
          </ButtonLink>
        )
      }
    >
      <Flex direction="column" gap="3">
        <Flex gap="2" align="center">
          <Badge size="small">{GROUP_KIND_LABELS[group.kind]}</Badge>
          {group.customers.length > 0 && (
            <TagGroup aria-label="Customers">
              {group.customers.map(customer => (
                <Tag key={customer} id={customer} size="small">
                  {customer}
                </Tag>
              ))}
            </TagGroup>
          )}
        </Flex>
        <Text as="p" variant="body-medium" className={classes.wrap}>
          {group.teaser}
        </Text>
        {group.progress && group.progress.to.total > 0 && (
          <DataBar
            label={progressMoveLabel(group.progress)}
            value={progressPercent(group.progress.to)}
            max={100}
            color="var(--bui-fg-announcement)"
          />
        )}
        {stories > 0 && (
          <SimpleAccordion
            title={`${stories} ${stories === 1 ? 'story' : 'stories'}`}
            headingLevel={4}
          >
            <List aria-label={`Stories of ${group.title}`}>
              {group.entries.map(entry => (
                <ListRow
                  key={entry.key}
                  id={entry.key}
                  textValue={entry.title}
                  description={[shortDay(entry.at), entry.author, entry.teaser]
                    .filter(Boolean)
                    .join(' · ')}
                  customActions={
                    <Badge size="small">{ENTRY_KIND_LABELS[entry.kind]}</Badge>
                  }
                >
                  <Link href={entry.url} {...linkTarget(entry.url)}>
                    {entry.title}
                  </Link>
                </ListRow>
              ))}
            </List>
          </SimpleAccordion>
        )}
      </Flex>
    </InfoCard>
  );
}

function HistoryView(props: {
  history: History;
  query: string;
  team: string;
  magazineTeam: string;
}) {
  const { history, query, team, magazineTeam } = props;
  const classes = useStyles();
  const groups = history.groups.filter(group =>
    matchesSearch(query, [
      group.title,
      group.teaser,
      ...group.customers,
      ...group.entries.map(entry => entry.title),
    ]),
  );

  return (
    <Flex direction="column" gap="6">
      <HiveScopeNote team={team} magazineTeam={magazineTeam} />
      {/* The figures count the magazine's team's work, not another team's. */}
      {followsTeam(team, magazineTeam) && (
        <Grid.Root columns={{ initial: '2', md: '4' }} gap="3">
          <InfoCard>
            <Stat label="Merged" value={history.stats.merged} />
          </InfoCard>
          <InfoCard>
            <Stat label="Closed" value={history.stats.closed} />
          </InfoCard>
          <InfoCard>
            <Stat label="Released" value={history.stats.released} />
          </InfoCard>
          <InfoCard>
            <Stat
              label="Epics moved"
              value={history.stats.epicsMoved}
              hint="Epics with at least one sub-issue closed in these three weeks."
            />
          </InfoCard>
        </Grid.Root>
      )}

      {history.summary.length > 0 && (
        <ul className={classes.summary} aria-label="Summary">
          {history.summary.map(line => (
            <li key={line}>
              <Text variant="body-medium" className={classes.wrap}>
                {line}
              </Text>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="hive-history-moved">
        <SectionHeader
          id="hive-history-moved"
          title="What moved"
          description={`${formatDate(history.from)} – ${formatDate(history.to)}`}
        />
        <Flex direction="column" mt="3">
          {groups.length === 0 ? (
            <Text as="p" color="secondary">
              {query
                ? 'Nothing in the last three weeks matches the search.'
                : 'Nothing moved in the last three weeks.'}
            </Text>
          ) : (
            <Grid.Root columns={{ initial: '1', lg: '2' }} gap="4">
              {groups.map(group => (
                <GroupCard key={group.key} group={group} />
              ))}
            </Grid.Root>
          )}
        </Flex>
      </section>

      {history.chores.count > 0 && (
        <Text variant="body-small" color="secondary">
          {`Plus ${history.chores.count} chores across ${history.chores.repos} repositories.`}
        </Text>
      )}
    </Flex>
  );
}

/**
 * History: what moved in the last three weeks (15 work days), epic by epic,
 * each with the issues that moved it, folded until opened.
 */
export function HiveHistoryTab() {
  const [team] = useHiveTeam();
  const [query] = useHiveSearch();
  const { data, isLoading, isFetching, error, refetch } = useHiveHistory(team);

  return data ? (
    <HistoryView
      history={data.view}
      query={query}
      team={team}
      magazineTeam={data.magazineTeam}
    />
  ) : (
    <HiveSourceState
      isLoading={isLoading}
      error={error}
      what="what moved"
      onRetry={refetch}
      isFetching={isFetching}
    />
  );
}
