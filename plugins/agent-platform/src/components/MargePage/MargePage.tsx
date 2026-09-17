import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Content, Progress } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Switch, Text } from '@backstage/ui';
import { useServerSignIn } from '@giantswarm/backstage-plugin-muster';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { useBotPrs, useMargeInstallation } from '../../hooks/useMarge';
import { useTeams } from '../../hooks/useTeams';
import {
  confirmModeOf,
  MARGE_SERVER,
  MargeNotConnectedError,
  MERGE_ACTIONS,
  REFRESH_ACTIONS,
  rowsOf,
  type BotPrRow,
} from '../../lib/marge';
import { margeTeamRouteRef } from '../../routes';
import { MargeTable, type BotPrAction, type MargeGrouping } from './MargeTable';
import { ConnectMargeAlert } from './ConnectMargeAlert';
import { MarkBlockedDialog } from './MarkBlockedDialog';
import { RemedyDialog } from './RemedyDialog';
import { SweepDialog } from './SweepDialog';
import { TeamSelect } from './TeamSelect';

/** Which per-PR dialog is open, and on which row. */
type OpenAction = { action: BotPrAction; row: BotPrRow } | undefined;

function formatReadAt(readAt: number | undefined): string {
  if (!readAt) {
    return '';
  }
  return new Date(readAt).toLocaleTimeString();
}

/**
 * The queue of one team through one installation's marge.
 *
 * The table is the stored classification: what the last sweep decided, read
 * from each PR's label in one search. **Refresh** is the only thing on the
 * page that classifies live, and it is a click. **Preview sweep** shows what a
 * sweep would do to each PR right now; **Apply** in that dialog does exactly
 * that, and nothing else. Every call runs through muster as the signed-in
 * person, with their own GitHub grant, so the evidence on a PR names them.
 */
function MargeQueue({
  installation,
  team,
  isResolvedFromAll,
}: {
  installation: string;
  team: string;
  isResolvedFromAll: boolean;
}) {
  const queue = useBotPrs(installation, team);
  const signIn = useServerSignIn(MARGE_SERVER, installation);
  const [groupBy, setGroupBy] = useState<MargeGrouping>('repository');
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [open, setOpen] = useState<OpenAction>(undefined);

  // A completed sign-in flips the server's auth status to connected; the
  // muster plugin invalidates its own reads then, and this one is keyed under
  // the same prefix, so the queue loads on its own. The reload here covers a
  // grant that connected in another tab, which the poll sees and the
  // invalidation does not.
  const wasConnected = signIn.isConnected;
  useEffect(() => {
    if (wasConnected && queue.error instanceof MargeNotConnectedError) {
      queue.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasConnected]);

  const rows = useMemo(() => rowsOf(queue.result), [queue.result]);
  const confirmMode = useMemo(
    () => confirmModeOf(queue.result),
    [queue.result],
  );
  const notConnected = queue.error instanceof MargeNotConnectedError;
  const canAct = !notConnected && queue.result !== undefined;

  const onAction = useCallback((action: BotPrAction, row: BotPrRow) => {
    setOpen({ action, row });
  }, []);
  const closeAction = useCallback(() => setOpen(undefined), []);

  const summary = queue.result?.summary;

  return (
    <Flex direction="column" gap="4">
      {isResolvedFromAll ? (
        <Text variant="body-small" color="secondary">
          Through muster on {installation}. Pin an installation in the header to
          use another muster.
        </Text>
      ) : null}

      <Flex gap="3" align="center" style={{ flexWrap: 'wrap' }}>
        <Switch
          label="Group by dependency"
          isSelected={groupBy === 'dependency'}
          onChange={selected =>
            setGroupBy(selected ? 'dependency' : 'repository')
          }
        />
        <div style={{ flex: 1 }} />
        <Button
          variant="secondary"
          size="small"
          isDisabled={!canAct || queue.isRefreshing}
          isPending={queue.isRefreshing}
          onPress={queue.refresh}
        >
          {queue.isRefreshing ? 'Classifying…' : 'Refresh classification'}
        </Button>
        <Button
          variant="primary"
          size="small"
          isDisabled={!canAct}
          onPress={() => setPreviewOpen(true)}
        >
          Preview sweep
        </Button>
      </Flex>

      {notConnected && queue.error ? (
        <ConnectMargeAlert
          installation={installation}
          message={queue.error.message}
        />
      ) : null}
      {queue.error && !notConnected ? (
        <Alert
          status="danger"
          title="marge refused the read"
          description={queue.error.message}
        />
      ) : null}

      {queue.isLoading ? <Progress /> : null}

      {queue.result && summary ? (
        <Text variant="body-small" color="secondary">
          {summary.total} open bot PR{summary.total === 1 ? '' : 's'} for team{' '}
          {team}.{' '}
          {queue.mode === 'stored'
            ? `Classification as the last sweep stored it on each PR, read at ${formatReadAt(
                queue.readAt,
              )}; Refresh classifies every PR now.`
            : `Every PR classified live at ${formatReadAt(queue.readAt)}.`}
          {summary.unclassified > 0
            ? ` ${summary.unclassified} PR${
                summary.unclassified === 1 ? ' has' : 's have'
              } no stored classification: no sweep has labelled ${
                summary.unclassified === 1 ? 'it' : 'them'
              } yet.`
            : ''}
        </Text>
      ) : null}

      {queue.result ? (
        <MargeTable
          rows={rows}
          groupBy={groupBy}
          canAct={canAct}
          onAction={onAction}
        />
      ) : null}

      <SweepDialog
        installation={installation}
        team={team}
        isOpen={isPreviewOpen}
        onOpenChange={setPreviewOpen}
        title={`Sweep team ${team}`}
        confirmLabel="Apply sweep"
        args={{}}
        confirmMode={confirmMode}
      />
      <SweepDialog
        installation={installation}
        team={team}
        isOpen={open?.action === 'merge'}
        onOpenChange={closeAction}
        title={open ? `Merge ${open.row.ref}` : 'Merge'}
        confirmLabel="Merge"
        args={{ prs: open ? [open.row.ref] : [], actions: MERGE_ACTIONS }}
        confirmMode={confirmMode}
      />
      <SweepDialog
        installation={installation}
        team={team}
        isOpen={open?.action === 'refresh'}
        onOpenChange={closeAction}
        title={open ? `Refresh ${open.row.ref}` : 'Refresh'}
        confirmLabel="Refresh branch"
        args={{ prs: open ? [open.row.ref] : [], actions: REFRESH_ACTIONS }}
        confirmMode={confirmMode}
      />
      <RemedyDialog
        installation={installation}
        team={team}
        row={open?.action === 'remedy' ? open.row : undefined}
        isOpen={open?.action === 'remedy'}
        onOpenChange={closeAction}
      />
      <MarkBlockedDialog
        installation={installation}
        team={team}
        row={open?.action === 'mark-blocked' ? open.row : undefined}
        isOpen={open?.action === 'mark-blocked'}
        onOpenChange={closeAction}
      />
    </Flex>
  );
}

/**
 * The marge tab's content for one team (`/agent-platform/marge/<team>`).
 * The team is in the URL so a team's queue is one link; the selector
 * navigates between teams, and the index route lands on the person's own.
 */
export function MargePage() {
  const { team = '' } = useParams<{ team: string }>();
  const navigate = useNavigate();
  const teamRoute = useRouteRef(margeTeamRouteRef);
  const teams = useTeams();
  const marge = useMargeInstallation();

  const onTeamChange = useCallback(
    (next: string) => {
      const href = teamRoute?.({ team: next });
      if (href) {
        navigate(href);
      }
    },
    [navigate, teamRoute],
  );

  let body;
  if (marge.isUnavailable) {
    body = (
      <EmptyStateCard
        title="The muster plugin is required"
        description="Bot PRs are read and swept through marge, reached through muster as you, and this portal has no muster plugin."
      />
    );
  } else if (marge.isLoading && !marge.installation) {
    body = <Progress />;
  } else if (!marge.installation) {
    body = (
      <EmptyStateCard
        title="No marge on this installation"
        description={
          marge.missing.length > 0
            ? `Bot PRs are read and swept through marge, and muster on ${marge.missing.join(
                ', ',
              )} lists no marge MCPServer. A platform admin registers marge with muster.`
            : 'No installation in scope runs a muster that lists marge.'
        }
      />
    );
  } else {
    body = (
      <MargeQueue
        installation={marge.installation}
        team={team}
        isResolvedFromAll={marge.isResolvedFromAll}
      />
    );
  }

  return (
    <Content>
      <Flex direction="column" gap="5">
        <TeamSelect
          team={team}
          teams={teams.teams}
          isLoading={teams.isLoading}
          onChange={onTeamChange}
        />
        {body}
      </Flex>
    </Content>
  );
}
