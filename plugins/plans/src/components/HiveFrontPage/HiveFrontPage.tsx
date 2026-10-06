import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Flex,
  Grid,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  DateComponent,
  InfoCard,
  Stat,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  useHiveHistory,
  useHiveNow,
  useHiveSearch,
  useHiveTeam,
} from '../../hooks/useHive';
import { useHiveDetail, useHiveWhen } from '../../hooks/useHiveDetail';
import { formatDate } from '../../lib/dates';
import {
  findEpic,
  FrontSection,
  HIVE_WHEN_OPTIONS,
  nowSections,
  searchSections,
  whenFromParam,
  windowSections,
} from '../../lib/frontPage';
import { ALL_TEAMS, nowFigures, teamName } from '../../lib/hive';
import { HistoryWindow } from '../../lib/magazine';
import { HiveSourceState } from '../HiveSourceState';
import { DocPane } from './DocPane';
import { EpicPane } from './EpicPane';
import { FrontSectionView } from './FrontSectionView';
import { PlanOverlay } from './PlanOverlay';

const useStyles = makeStyles({
  summary: {
    margin: 0,
    paddingLeft: 'var(--bui-space-5)',
  },
  toolbar: {
    flexWrap: 'wrap',
  },
});

interface Figure {
  label: string;
  value: number;
  hint?: string;
  tone?: 'warning';
}

/** The summary band: four figures for the moment, and the summary lines. */
function SummaryBand(props: { figures: Figure[]; summary: string[] }) {
  const classes = useStyles();
  return (
    <Flex direction="column" gap="4">
      <Grid.Root columns={{ initial: '2', md: '4' }} gap="3">
        {props.figures.map(figure => (
          <InfoCard key={figure.label}>
            <Stat
              label={figure.label}
              value={figure.value}
              hint={figure.hint}
              tone={figure.value > 0 ? figure.tone : undefined}
            />
          </InfoCard>
        ))}
      </Grid.Root>
      {props.summary.length > 0 && (
        <ul className={classes.summary} aria-label="Summary">
          {props.summary.map(line => (
            <li key={line}>
              <Text variant="body-large">{line}</Text>
            </li>
          ))}
        </ul>
      )}
    </Flex>
  );
}

/**
 * Hive's front page (`/hive`): one page read top to bottom, with one time
 * control. Now is the default; 3 days, 3 weeks and 3 months turn the same
 * sections into what moved. An epic, a plan's review and a knowledge
 * document open in place, each in its own query parameter, so every one is
 * a link and Escape returns to where the reader was.
 */
export function HiveFrontPage() {
  const classes = useStyles();
  const [when, setWhen] = useHiveWhen();
  const [team] = useHiveTeam();
  const [query] = useHiveSearch();
  const { item } = useHiveDetail();
  const { hash } = useLocation();

  // The epic pane tells what moved in the window the page reads, or in the
  // last 3 weeks when it reads now.
  const historyWindow: HistoryWindow = when === 'now' ? 'weeks' : when;
  const now = useHiveNow(team);
  const history = useHiveHistory(historyWindow, team);

  // An old `/plans` link lands on `#plans`: scroll there once it renders.
  const ready = when === 'now' ? Boolean(now.data) : Boolean(history.data);
  useEffect(() => {
    if (ready && hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    }
  }, [ready, hash]);

  const scope = team === ALL_TEAMS ? 'all teams' : teamName(team);
  let band: { figures: Figure[]; summary: string[] } | undefined;
  let sections: FrontSection[] | undefined;
  let updated: string | undefined;
  if (when === 'now' && now.data) {
    const figures = nowFigures(now.data);
    band = {
      figures: [
        {
          label: 'Open for customers',
          value: figures.customers,
          hint: `Open board items with a customer, ${scope}.`,
        },
        {
          label: 'In progress',
          value: figures.inProgress,
          hint: 'Items in the In Progress column.',
        },
        {
          label: 'Blocked',
          value: figures.blocked,
          hint: 'Items with a recorded blocker.',
          tone: 'warning',
        },
        {
          label: 'Plans waiting',
          value: figures.plansWaiting,
          hint: 'Plans being grilled, drafted or waiting for review.',
        },
      ],
      summary: now.data.summary,
    };
    sections = nowSections(now.data);
    updated = now.data.generatedAt;
  } else if (when !== 'now' && history.data) {
    const { stats } = history.data;
    band = {
      figures: [
        { label: 'Merged', value: stats.merged },
        { label: 'Closed', value: stats.closed },
        { label: 'Released', value: stats.released },
        {
          label: 'Epics moved',
          value: stats.epicsMoved,
          hint: 'Epics with at least one sub-issue closed in the window.',
        },
      ],
      summary: history.data.summary,
    };
    // The plans the window merged come from now's plan list; when it failed
    // to load, the Plans section says so and the rest still renders.
    sections = windowSections(history.data, now.data?.reviews ?? []);
    updated = history.data.generatedAt;
  }
  const source = when === 'now' ? now : history;

  return (
    <Flex direction="column" gap="7">
      <Flex
        align="center"
        justify="between"
        gap="3"
        className={classes.toolbar}
      >
        <ToggleButtonGroup
          aria-label="Time"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[when]}
          onSelectionChange={keys => {
            const [next] = [...keys];
            if (next) {
              setWhen(whenFromParam(String(next)));
            }
          }}
        >
          {HIVE_WHEN_OPTIONS.map(option => (
            <ToggleButton key={option.id} id={option.id}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {when !== 'now' && history.data ? (
          <Text variant="body-small" color="secondary">
            {`${formatDate(history.data.from)} – ${formatDate(history.data.to)}`}
          </Text>
        ) : (
          updated && (
            <Text variant="body-small" color="secondary">
              Updated <DateComponent value={updated} relative />
            </Text>
          )
        )}
      </Flex>

      {band && sections ? (
        <>
          <SummaryBand figures={band.figures} summary={band.summary} />
          {searchSections(sections, query).map(section =>
            section.id === 'plans' && when !== 'now' && now.error ? (
              <HiveSourceState
                key={section.id}
                isLoading={false}
                error={now.error}
                what="the plans"
              />
            ) : (
              <FrontSectionView key={section.id} section={section} />
            ),
          )}
        </>
      ) : (
        <HiveSourceState
          isLoading={source.isLoading}
          error={source.error}
          what={when === 'now' ? 'what the team works on now' : 'what moved'}
        />
      )}

      <EpicPane
        epic={item ? findEpic(item, now.data, history.data) : {}}
        now={now.data}
        historyWindow={historyWindow}
      />
      <DocPane />
      <PlanOverlay />
    </Flex>
  );
}
