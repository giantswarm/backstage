import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Flex,
  Link,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { Progress as LoadingProgress } from '@backstage/core-components';
import { MagazineSource, useMagazineJson } from '../../hooks/useMagazineJson';
import { formatDate } from '../../lib/dates';
import {
  Entry,
  ENTRY_KIND_LABELS,
  Group,
  History,
  HISTORY_WINDOWS,
  HistoryWindow,
  historyWindowFromParam,
  magazineFile,
  progressMoveLabel,
  shortDay,
  visibleCards,
} from '../../lib/magazine';
import {
  CardGrid,
  CustomerTags,
  LinkRow,
  MagazineSection,
  ProgressLine,
  SummaryLines,
} from '../MagazineItemCard';
import { PlansErrorAlert } from '../PlansErrorAlert';

const external = { target: '_blank', rel: 'noopener noreferrer' };

const useStyles = makeStyles({
  stats: {
    display: 'grid',
    gap: 'var(--bui-space-3)',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    margin: 'var(--bui-space-3) 0',
  },
  stat: {
    border: '1px solid var(--bui-border-1)',
    borderRadius: 'var(--bui-radius-3)',
    padding: 'var(--bui-space-2) var(--bui-space-3)',
  },
  entries: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-2)',
  },
});

function Stat(props: { label: string; value: number }) {
  const classes = useStyles();
  return (
    <div className={classes.stat}>
      <Text as="div" variant="title-medium">
        {props.value}
      </Text>
      <Text as="div" variant="body-small" color="secondary">
        {props.label}
      </Text>
    </div>
  );
}

function EntryItem(props: { entry: Entry }) {
  const { entry } = props;
  return (
    <li>
      <Flex gap="2" align="baseline" style={{ flexWrap: 'wrap' }}>
        <Badge size="small">{ENTRY_KIND_LABELS[entry.kind]}</Badge>
        <Link href={entry.url} {...external}>
          {entry.title}
        </Link>
        <Text variant="body-small" color="secondary">
          {[shortDay(entry.at), entry.repo, entry.author, entry.team]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Flex>
      {entry.teaser && (
        <Text as="p" variant="body-small" color="secondary">
          {entry.teaser}
        </Text>
      )}
    </li>
  );
}

/** Entries of a group: all at day zoom, the first few at week and month zoom. */
function EntryList(props: { entries: Entry[]; collapsed: boolean }) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(!props.collapsed);
  const { shown, hidden } = visibleCards(props.entries, expanded, 3);
  if (props.entries.length === 0) {
    return null;
  }
  return (
    <>
      <ul className={classes.entries}>
        {shown.map(entry => (
          <EntryItem key={entry.key} entry={entry} />
        ))}
      </ul>
      {hidden > 0 && (
        <div>
          <Button
            variant="tertiary"
            size="small"
            onPress={() => setExpanded(true)}
          >
            {`Show all ${props.entries.length}`}
          </Button>
        </div>
      )}
    </>
  );
}

function GroupCard(props: { group: Group; collapsed: boolean }) {
  const { group } = props;
  return (
    <Card>
      <CardBody>
        <Flex direction="column" gap="2">
          <Text as="h4" variant="title-x-small">
            {group.url ? (
              <Link href={group.url} {...external}>
                {group.title}
              </Link>
            ) : (
              group.title
            )}
          </Text>
          <Text as="p" variant="body-medium">
            {group.teaser}
          </Text>
          {group.progress && group.progress.to.total > 0 && (
            <ProgressLine
              progress={group.progress.to}
              label={progressMoveLabel(group.progress)}
            />
          )}
          <CustomerTags customers={group.customers} />
          <EntryList entries={group.entries} collapsed={props.collapsed} />
          <LinkRow links={[]} tryIt={group.tryIt} />
        </Flex>
      </CardBody>
    </Card>
  );
}

/** "keys" of a highlight as links to the entries they name. */
function KeyLinks(props: { keys: string[]; entries: Map<string, Entry> }) {
  return (
    <>
      {props.keys.map((key, i) => {
        const entry = props.entries.get(key);
        return (
          <span key={key}>
            {i > 0 && ', '}
            {entry ? (
              <Link href={entry.url} {...external}>
                {entry.title}
              </Link>
            ) : (
              key
            )}
          </span>
        );
      })}
    </>
  );
}

function HistoryView(props: { history: History }) {
  const { history } = props;
  const classes = useStyles();
  const [choresOpen, setChoresOpen] = useState(false);
  const entries = useMemo(() => {
    const byKey = new Map<string, Entry>();
    for (const group of history.groups) {
      for (const entry of group.entries) {
        byKey.set(entry.key, entry);
      }
    }
    return byKey;
  }, [history]);
  const { customers, outsideTeam } = history.highlights;
  const collapsed = history.window !== 'days';

  return (
    <>
      <MagazineSection
        id="history-summary"
        title={`${formatDate(history.from)} – ${formatDate(history.to)}`}
      >
        <SummaryLines lines={history.summary} />
        <div className={classes.stats} aria-label="Statistics" role="group">
          <Stat label="Merged" value={history.stats.merged} />
          <Stat label="Closed" value={history.stats.closed} />
          <Stat label="Released" value={history.stats.released} />
          <Stat label="Epics moved" value={history.stats.epicsMoved} />
        </div>
      </MagazineSection>
      <MagazineSection id="history-groups" title="What moved">
        {history.groups.length === 0 ? (
          <Text as="p" color="secondary">
            Nothing moved in this window.
          </Text>
        ) : (
          <CardGrid>
            {history.groups.map(group => (
              <GroupCard key={group.key} group={group} collapsed={collapsed} />
            ))}
          </CardGrid>
        )}
      </MagazineSection>
      {(customers.length > 0 || outsideTeam.length > 0) && (
        <MagazineSection id="highlights" title="Highlights">
          <Flex direction="column" gap="2">
            {customers.map(highlight => (
              <Text as="p" key={`customer-${highlight.name}`}>
                <strong>For {highlight.name}:</strong>{' '}
                <KeyLinks keys={highlight.keys} entries={entries} />
              </Text>
            ))}
            {outsideTeam.map(highlight => (
              <Text as="p" key={`team-${highlight.team}`}>
                <strong>From {highlight.team}:</strong>{' '}
                <KeyLinks keys={highlight.keys} entries={entries} />
              </Text>
            ))}
          </Flex>
        </MagazineSection>
      )}
      {history.chores.count > 0 && (
        <MagazineSection
          id="chores"
          title="Chores"
          summary={`${history.chores.count} chores across ${history.chores.repos} repositories.`}
          actions={
            history.chores.sample.length > 0 && (
              <Button
                variant="tertiary"
                size="small"
                aria-expanded={choresOpen}
                onPress={() => setChoresOpen(!choresOpen)}
              >
                {choresOpen ? 'Hide' : 'Show examples'}
              </Button>
            )
          }
        >
          {choresOpen && (
            <ul className={classes.entries}>
              {history.chores.sample.map(entry => (
                <EntryItem key={entry.key} entry={entry} />
              ))}
            </ul>
          )}
        </MagazineSection>
      )}
    </>
  );
}

function HistoryWindowView(props: {
  source: MagazineSource;
  window: HistoryWindow;
}) {
  const { data, isLoading, error } = useMagazineJson<History>(
    props.source,
    magazineFile(props.window),
  );
  if (isLoading) {
    return <LoadingProgress />;
  }
  if (error) {
    return (
      <PlansErrorAlert
        title="Failed to load the history"
        error={error as Error}
      />
    );
  }
  return data ? <HistoryView history={data} /> : null;
}

/**
 * What shipped: three windows, three zoom levels. The window lives in
 * `?window=` so a link to "the last 3 weeks" is shareable.
 */
export function MagazineHistoryTab(props: { source: MagazineSource }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const historyWindow = historyWindowFromParam(searchParams.get('window'));

  const selectWindow = (next: HistoryWindow) =>
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev);
        params.set('window', next);
        return params;
      },
      { replace: true },
    );

  return (
    <>
      <div style={{ marginBottom: 'var(--bui-space-4)' }}>
        <ToggleButtonGroup
          aria-label="History window"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[historyWindow]}
          onSelectionChange={keys => {
            const [next] = [...keys];
            if (next) {
              selectWindow(historyWindowFromParam(String(next)));
            }
          }}
        >
          {HISTORY_WINDOWS.map(option => (
            <ToggleButton key={option.id} id={option.id}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
      <HistoryWindowView
        key={historyWindow}
        source={props.source}
        window={historyWindow}
      />
    </>
  );
}
