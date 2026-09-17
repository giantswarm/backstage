import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, Progress } from '@backstage/core-components';
import { Box, Button, Tab, Tabs, Tooltip, Typography } from '@material-ui/core';
import { Alert } from '@backstage/ui';
import { useServerSignIn } from '@giantswarm/backstage-plugin-muster';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { useBotPrs, useMargeInstallation } from '../../hooks/useMarge';
import { useTeams } from '../../hooks/useTeams';
import {
  confirmModeOf,
  MARGE_SERVER,
  rowsOf,
  type BotPrRow,
  type MargeResult,
} from '../../lib/marge';
import {
  applyFilters,
  classificationOptions,
  filtersFromParams,
  hasFilters,
  optionsOf,
  withFilter,
  type QueueFilters,
  type Scope,
} from '../../lib/rows';
import { BotPrsTable } from '../BotPrsTable';
import { ConnectMargeAlert } from '../ConnectMargeAlert';
import { FilterBar } from '../FilterBar';
import { MarkBlockedDialog } from '../MarkBlockedDialog';
import { SweepDialog } from '../SweepDialog';
import { Tiles } from '../Tiles';

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'mine', label: 'My team' },
  { id: 'all', label: 'All teams' },
];

type OpenDialog =
  | { kind: 'sweep'; team: string; pr?: string }
  | { kind: 'mark'; row: BotPrRow }
  | undefined;

function formatReadAt(readAt: number | undefined): string {
  return readAt ? new Date(readAt).toLocaleTimeString() : '';
}

/**
 * The queues of the teams in scope through one installation's marge: the
 * tiles, the filters, the summary line and the table, the same shape as the
 * Repositories page. The table is the stored classification, what the last
 * sweep decided; **Refresh classification** is the only live read, and a
 * click. **Preview sweep** and the per-PR **Sweep this PR** show what the
 * engine would do before it does it. Every call runs through muster as the
 * signed-in person with their own GitHub grant.
 */
function Queue({
  installation,
  teams,
  allTeams,
  filters,
  setFilter,
  isResolvedFromAll,
}: {
  installation: string;
  /** The teams read: the scope's, or the one the URL names. */
  teams: string[];
  /** The scope's teams, for the team filter's options. */
  allTeams: string[];
  filters: QueueFilters;
  setFilter: (name: keyof QueueFilters, value: string | undefined) => void;
  isResolvedFromAll: boolean;
}) {
  const queue = useBotPrs(installation, teams);
  const signIn = useServerSignIn(MARGE_SERVER, installation);
  const [open, setOpen] = useState<OpenDialog>(undefined);

  // A completed sign-in flips the server's auth status to connected. The
  // muster plugin invalidates its own reads then, and the queue is keyed
  // under the same prefix, so it loads on its own; this covers a grant that
  // connected in another tab, which the poll sees and the invalidation does
  // not.
  const isConnected = signIn.isConnected;
  useEffect(() => {
    if (isConnected && queue.notConnected) {
      queue.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const rows = useMemo(
    () => queue.queues.flatMap(entry => rowsOf(entry.result, entry.team)),
    [queue.queues],
  );
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const answered = queue.queues.filter(entry => entry.result);
  const refused = queue.queues.filter(
    entry => entry.error && entry.error !== queue.notConnected,
  );
  const total = answered.reduce(
    (sum, entry) => sum + (entry.result?.summary.total ?? 0),
    0,
  );
  const unclassified = answered.reduce(
    (sum, entry) => sum + (entry.result?.summary.unclassified ?? 0),
    0,
  );
  const isLive =
    answered.length > 0 && answered.every(entry => entry.mode === 'live');
  const readAt = Math.max(0, ...answered.map(entry => entry.readAt ?? 0));
  const canAct = !queue.notConnected && answered.length > 0;

  // A whole-team sweep needs one team: the scope's only team, or the team
  // the filter picked. With several teams in view the button says so.
  const sweepTeam = teams.length === 1 ? teams[0] : (filters.team ?? undefined);
  const confirmModeOfTeam = (team: string) =>
    confirmModeOf(
      queue.queues.find(entry => entry.team === team)?.result as
        MargeResult | undefined,
    );

  const onSweep = useCallback(
    (row: BotPrRow) => setOpen({ kind: 'sweep', team: row.team, pr: row.ref }),
    [],
  );
  const onMarkBlocked = useCallback(
    (row: BotPrRow) => setOpen({ kind: 'mark', row }),
    [],
  );
  const close = useCallback(() => setOpen(undefined), []);

  return (
    <>
      <Box display="flex" alignItems="center" pt={1}>
        <Box flexGrow={1}>
          {isResolvedFromAll ? (
            <Typography variant="body2" color="textSecondary">
              Through muster on {installation}.
            </Typography>
          ) : null}
        </Box>
        <Box mr={1}>
          <Tooltip title="Classify every PR in view again, now: one check read per PR. The table otherwise shows what the last sweep stored on each PR.">
            <span>
              <Button
                size="small"
                variant="outlined"
                disabled={!canAct || queue.isRefreshing}
                onClick={queue.refresh}
              >
                {queue.isRefreshing ? 'Classifying…' : 'Refresh classification'}
              </Button>
            </span>
          </Tooltip>
        </Box>
        <Tooltip
          title={
            sweepTeam
              ? `Show what a sweep would do to each PR of team ${sweepTeam}, step by step, before applying it.`
              : 'A sweep runs under one team’s policy: pick a team in the filters to preview one.'
          }
        >
          <span>
            <Button
              size="small"
              variant="contained"
              color="primary"
              disabled={!canAct || !sweepTeam}
              onClick={() =>
                sweepTeam && setOpen({ kind: 'sweep', team: sweepTeam })
              }
            >
              Preview sweep
            </Button>
          </span>
        </Tooltip>
      </Box>

      {queue.notConnected ? (
        <Box pt={2}>
          <ConnectMargeAlert
            installation={installation}
            message={queue.notConnected.message}
          />
        </Box>
      ) : null}
      {refused.map(entry => (
        <Box pt={2} key={entry.team}>
          <Alert
            status="danger"
            title={`marge refused the read for team ${entry.team}`}
            description={entry.error?.message}
          />
        </Box>
      ))}

      {queue.isLoading ? (
        <Box pt={2}>
          <Progress />
        </Box>
      ) : null}

      {answered.length > 0 ? (
        <>
          <Box pt={2}>
            <Tiles rows={filtered} />
          </Box>
          <Box pt={2}>
            <FilterBar
              filters={filters}
              teams={[...new Set([...allTeams, ...teams])].sort()}
              repositories={optionsOf(rows, row => row.repository)}
              kinds={optionsOf(rows, row => row.kind)}
              classifications={classificationOptions(rows)}
              dependencies={optionsOf(rows, row => row.dependency)}
              onChange={setFilter}
            />
          </Box>
          <Box pt={2} pb={1}>
            <Typography
              variant="body2"
              color="textSecondary"
              data-testid="queue-summary"
            >
              {`${filtered.length} of ${total} open bot PR${
                total === 1 ? '' : 's'
              }${hasFilters(filters) ? ' (filtered)' : ''} across ${
                answered.length
              } team${answered.length === 1 ? '' : 's'}; `}
              {isLive
                ? `every PR classified live at ${formatReadAt(readAt)}`
                : `classification as the last sweep stored it on each PR, read at ${formatReadAt(
                    readAt,
                  )}`}
              {unclassified > 0
                ? `; ${unclassified} with no stored classification, no sweep has labelled ${
                    unclassified === 1 ? 'it' : 'them'
                  } yet`
                : ''}
              .
            </Typography>
          </Box>
          <BotPrsTable
            rows={filtered}
            showTeam={teams.length > 1}
            isLive={isLive}
            canAct={canAct}
            onSweep={onSweep}
            onMarkBlocked={onMarkBlocked}
          />
        </>
      ) : null}

      {open?.kind === 'sweep' ? (
        <SweepDialog
          installation={installation}
          team={open.team}
          isOpen
          onOpenChange={close}
          pr={open.pr}
          confirmMode={confirmModeOfTeam(open.team)}
        />
      ) : null}
      {open?.kind === 'mark' ? (
        <MarkBlockedDialog
          installation={installation}
          team={open.row.team}
          row={open.row}
          isOpen
          onOpenChange={close}
        />
      ) : null}
    </>
  );
}

/**
 * The Bot PRs page: the open bot PRs of the person's teams, or of every team,
 * as marge classifies them, and the sweep's own steps behind a preview. The
 * scope and the filters live in the URL (`?scope=all&team=bumblebee`), so a
 * view is one link.
 */
export function BotPrsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const teams = useTeams();
  const marge = useMargeInstallation();

  const filters = useMemo(
    () => filtersFromParams(searchParams),
    [searchParams],
  );
  const setFilter = useCallback(
    (name: keyof QueueFilters, value: string | undefined) =>
      setSearchParams(prev => withFilter(prev, name, value), {
        replace: true,
      }),
    [setSearchParams],
  );

  // My team for a person the catalogue places in one; All teams otherwise.
  // A team named in the URL is the scope on its own: the link a person
  // shares, and the way to a team the catalogue does not list.
  const scope: Scope =
    filters.scope ?? (teams.ownTeams.length > 0 ? 'mine' : 'all');
  const scopeTeams = scope === 'mine' ? teams.ownTeams : teams.teams;
  const inScope = useMemo(
    () => (filters.team ? [filters.team] : scopeTeams),
    // Keyed on contents: the hook derives its arrays fresh each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.team, scopeTeams.join(',')],
  );

  let body;
  if (marge.isUnavailable) {
    body = (
      <EmptyStateCard
        title="The muster plugin is required"
        description="Bot PRs are read and swept through marge, reached through muster as you, and this portal has no muster plugin."
      />
    );
  } else if ((marge.isLoading && !marge.installation) || teams.isLoading) {
    body = <Progress />;
  } else if (!marge.installation) {
    body = (
      <EmptyStateCard
        title="No marge on this portal's installations"
        description={
          marge.missing.length > 0
            ? `Bot PRs are read and swept through marge, and muster on ${marge.missing.join(
                ', ',
              )} lists no marge MCPServer. A platform admin registers marge with muster.`
            : 'No installation runs a muster that lists marge.'
        }
      />
    );
  } else if (inScope.length === 0) {
    body = (
      <Typography variant="body2" color="textSecondary">
        {scope === 'mine'
          ? 'The catalogue places you in no team. All teams lists every team it names.'
          : 'The catalogue names no team group. A team named in the URL, ?team=<name>, is read all the same.'}
      </Typography>
    );
  } else {
    body = (
      <Queue
        installation={marge.installation}
        teams={inScope}
        allTeams={scopeTeams}
        filters={filters}
        setFilter={setFilter}
        isResolvedFromAll={marge.isResolvedFromAll}
      />
    );
  }

  return (
    <Content>
      <Tabs
        value={scope}
        onChange={(_event, next: Scope) => {
          setSearchParams(
            prev =>
              withFilter(withFilter(prev, 'scope', next), 'team', undefined),
            { replace: true },
          );
        }}
        aria-label="Scope"
      >
        {SCOPES.map(tab => (
          <Tab key={tab.id} value={tab.id} label={tab.label} />
        ))}
      </Tabs>
      <Box pt={1}>{body}</Box>
    </Content>
  );
}
