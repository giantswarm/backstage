import { ReactNode } from 'react';
import { Box, Button, Grid, Typography } from '@material-ui/core';
import RefreshIcon from '@material-ui/icons/Refresh';
import { Alert, Text } from '@backstage/ui';
import { Link, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Fact,
  FactList,
  InfoCard,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import { CI, HeadStatus, InventoryRecord, repositoriesApiRef } from '../apis';
import { convergedState } from '../lib/setupStatus';
import { RowActions } from './actions/RowActions';
import { FindingsList } from './FindingsList';
import { RepositoriesErrorAlert } from './RepositoriesErrorAlert';
import { SetupSteps } from './SetupSteps';

/** A set-up still converging is re-read this often: the steps update live. */
const CONVERGING_POLL_MS = 15_000;

const catalogEntityPath = (name: string) =>
  `/catalog/default/component/${name}`;

const date = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);
const dateTime = (iso?: string) =>
  iso ? `${iso.slice(0, 16).replace('T', ' ')}Z` : undefined;

/** A fact for the list, or nothing when the record has no value for it. */
function fact(
  label: string,
  value: ReactNode | undefined | null | false,
): Fact | undefined {
  if (
    value === undefined ||
    value === null ||
    value === false ||
    value === ''
  ) {
    return undefined;
  }
  return { label, value };
}

const facts = (...items: (Fact | undefined)[]): Fact[] =>
  items.filter((item): item is Fact => item !== undefined);

const commit = (entry?: { date: string; author: string }) =>
  entry && `${date(entry.date)} by ${entry.author}`;

const yes = (flag?: boolean) => (flag ? 'yes' : undefined);

/** The record has no value for this fact: shown as a dash, never made up. */
const NONE = '—';

/** A commit's CircleCI statuses in one phrase: the worst state, the jobs, when. */
const built = (status: HeadStatus) =>
  `${status.state} (${status.contexts.length} ${status.contexts.length === 1 ? 'job' : 'jobs'}, ${dateTime(status.at)})`;

/** Whether CircleCI builds the repository, and how the default branch's head fared. */
function circleciFact(
  circleci: NonNullable<InventoryRecord['circleci']>,
  branch: string,
): string {
  if (!circleci.followed) {
    return 'not followed';
  }
  return circleci.head
    ? `builds ${branch}: ${built(circleci.head)}`
    : 'followed';
}

/**
 * The CI facts of a repository in the record's words: the orb version,
 * whether the images include arm64, how they reach China and whether they
 * are signed -- each a dash without a CircleCI configuration to read it from.
 */
function ciFacts(ci?: CI): (Fact | undefined)[] {
  const arm64 = { true: 'arm64', false: 'amd64 only' }[String(ci?.arm64)];
  const signing =
    ci?.signing === 'unsigned' && ci.signingReason
      ? `unsigned: ${ci.signingReason}`
      : ci?.signing;
  return [
    fact('Orb', ci?.orb ? `architect ${ci.orb}` : NONE),
    fact('Images', arm64 ?? NONE),
    fact('China push', ci?.chinaPush ?? NONE),
    fact('Signing', signing ?? NONE),
  ];
}

/** A card of grouped facts, half the row wide (a value must not break mid-word); nothing when every fact is empty. */
function FactsCard({ title, items }: { title: string; items: Fact[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Grid item xs={12} md={6}>
      <InfoCard title={title}>
        <FactList facts={items} labelWidth={140} maxWidth={null} />
      </InfoCard>
    </Grid>
  );
}

/** The set-up state of a record, as the header and the row show it. */
function SetupState({ record }: { record: InventoryRecord }) {
  const { checks, checkError } = record.setup;
  if (!checks) {
    return (
      <StatusLabel label="unchecked" intent="neutral" title={checkError} />
    );
  }
  return (
    <StatusLabel
      label={convergedState(checks)}
      intent={checks.converged ? 'positive' : 'warning'}
      title={
        checks.converged
          ? undefined
          : `${checks.steps.filter(step => step.verdict !== 'ok' && step.verdict !== 'skipped').length} steps not ok`
      }
    />
  );
}

/**
 * The expanded row: one repository's inventory record as `get_repository`
 * returns it. The header names the repository (a link to GitHub), its set-up
 * state and the actions; the facts are grouped -- Ownership, Activity,
 * Tooling -- with empty ones left out, except the CI facts (the build of the
 * default branch and of the latest release, the orb, arm64, China push,
 * signing), which show a dash where the record has no CircleCI configuration
 * to read them from; then the findings with their fix and the set-up steps,
 * re-read every 15 s while they converge.
 */
export function RepositoryDetails({ repository }: { repository: string }) {
  const api = useApi(repositoriesApiRef);
  const queryClient = useQueryClient();
  const queryKey = ['repositories', 'record', repository];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.getRepository(repository),
    refetchInterval: query =>
      query.state.data?.setup.checks?.converged === false
        ? CONVERGING_POLL_MS
        : false,
  });

  const refresh = useMutation({
    mutationFn: () => api.refreshRepository(repository),
    onSuccess: (record: InventoryRecord) => {
      queryClient.setQueryData(queryKey, record);
      void queryClient.invalidateQueries({
        queryKey: ['repositories', 'list'],
      });
    },
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return (
      <RepositoriesErrorAlert
        title={`Failed to read ${repository}`}
        error={error as Error}
      />
    );
  }
  if (!data) {
    return null;
  }
  const record = data;
  const { declaration, reality, renovate, circleci, setup } = record;
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ['repositories', 'list'] });
  };

  const ownership = facts(
    fact('Team', declaration?.team ?? 'unassigned'),
    fact('Declared in', declaration?.file),
    fact('Lifecycle', declaration?.lifecycle),
    fact('Component type', declaration?.componentType),
    fact('Flavours', declaration?.flavours?.join(', ')),
    fact('CODEOWNERS teams', reality?.codeownersTeams?.join(', ')),
    fact(
      'Unknown CODEOWNERS teams',
      reality?.unknownCodeownersTeams?.join(', '),
    ),
    fact(
      'Team mapping',
      record.mapping.present ? record.mapping.team : 'missing',
    ),
    fact(
      'Catalog',
      record.catalog.present ? (
        <Text variant="body-small">
          <Link to={catalogEntityPath(record.name)}>Catalog entity</Link>
        </Text>
      ) : (
        'missing'
      ),
    ),
  );

  const activity = facts(
    fact('Last commit', commit(reality?.lastCommit)),
    fact('Last person commit', commit(reality?.lastPersonCommit)),
    fact('Last push', date(reality?.pushedAt)),
    fact(
      'Open pull requests',
      reality &&
        (reality.openPullRequests.total === 0
          ? '0'
          : `${reality.openPullRequests.total} (${reality.openPullRequests.people} by people, ${reality.openPullRequests.bots} by bots)`),
    ),
    fact('Open issues', reality && String(reality.openIssues)),
    fact(
      'Latest release',
      reality?.latestRelease && (
        <Text variant="body-small">
          <Link
            to={`${reality.url}/releases/tag/${reality.latestRelease.tag}`}
            target="_blank"
            rel="noopener"
          >
            {reality.latestRelease.tag}
          </Link>
          {` on ${date(reality.latestRelease.publishedAt)}`}
        </Text>
      ),
    ),
    fact(
      'Last reconciler run',
      setup.lastRun && (
        <Text variant="body-small">
          <Link to={setup.lastRun.runUrl} target="_blank" rel="noopener">
            {date(setup.lastRun.timestamp)}
          </Link>
          {`, ${setup.lastRun.result.mode}`}
          {setup.lastRun.change && ` (${setup.lastRun.change.kind})`}
        </Text>
      ),
    ),
    fact(
      'Reconciler run expected',
      setup.pendingRun &&
        `since ${dateTime(setup.pendingRun.dispatchedAt)}${setup.pendingRun.kind ? `, ${setup.pendingRun.kind}` : ''} by ${setup.pendingRun.by}`,
    ),
    fact('Created', date(reality?.createdAt)),
  );

  const tooling = facts(
    fact(
      'Renovate',
      renovate.configured
        ? `${renovate.path}${renovate.enabled ? '' : ' (disabled)'}${renovate.preset ? ', preset' : ''}`
        : 'not configured',
    ),
    fact(
      'CircleCI',
      circleci && circleciFact(circleci, reality?.defaultBranch ?? 'main'),
    ),
    fact(
      'Release build',
      reality?.latestRelease &&
        (reality.latestRelease.build
          ? `built: ${built(reality.latestRelease.build)}`
          : NONE),
    ),
    ...ciFacts(record.ci),
    fact('Language', declaration?.language ?? reality?.language),
    fact('Visibility', reality?.visibility),
    fact('Default branch', reality?.defaultBranch),
    fact('Archived on GitHub', yes(reality?.isArchived)),
    fact('Fork', yes(reality?.isFork)),
    fact('Template', yes(reality?.isTemplate)),
    fact('Empty', yes(reality?.isEmpty)),
    fact('Topics', reality?.topics?.join(', ')),
  );

  return (
    <Box
      display="flex"
      flexDirection="column"
      gridGap={16}
      data-testid={`record-${record.name}`}
    >
      <Box display="flex" alignItems="flex-start" flexWrap="wrap" gridGap={16}>
        <Box flexGrow={1} minWidth={0}>
          <Box display="flex" alignItems="center" flexWrap="wrap" gridGap={16}>
            <Typography variant="h6" component="h3">
              {reality ? (
                <Link to={reality.url} target="_blank" rel="noopener">
                  {record.repository}
                </Link>
              ) : (
                record.repository
              )}
            </Typography>
            <div data-testid="setup-state">
              <SetupState record={record} />
            </div>
          </Box>
          <Typography variant="body2" color="textSecondary">
            {reality?.description && <>{reality.description} · </>}
            Record from {record.source}, {record.age} old
            {setup.checkedAt && (
              <> · set-up checked {dateTime(setup.checkedAt)}</>
            )}
            {refresh.isError && (
              <> · refresh failed: {(refresh.error as Error).message}</>
            )}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gridGap={8}>
          <RowActions record={record} onChanged={changed} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </Box>
      </Box>

      {reality === null && (
        <Alert
          status="warning"
          title="Gone from GitHub"
          description="The declaration stands, but no repository answers to this name on GitHub."
        />
      )}
      {declaration?.problems && declaration.problems.length > 0 && (
        <Alert
          status="danger"
          title="Declaration refused"
          description={declaration.problems.join('; ')}
        />
      )}

      <Grid container spacing={2}>
        <FactsCard title="Ownership" items={ownership} />
        <FactsCard title="Activity" items={activity} />
        <FactsCard title="Tooling" items={tooling} />
        {record.findings.length > 0 && (
          <Grid item xs={12} md={6}>
            <InfoCard title={`Findings (${record.findings.length})`}>
              <FindingsList
                findings={record.findings}
                data-testid="record-findings"
              />
            </InfoCard>
          </Grid>
        )}
      </Grid>

      <InfoCard title="Set-up steps">
        {setup.checks ? (
          <Box display="flex" flexDirection="column" gridGap={8}>
            <Typography variant="body2" color="textSecondary">
              The engine's {setup.checks.mode} run of{' '}
              {dateTime(setup.checks.finishedAt)}
              {setup.checks.declared !== setup.checks.repository &&
                `, declared as ${setup.checks.declared}`}
              .
            </Typography>
            <SetupSteps result={setup.checks} />
          </Box>
        ) : (
          <Typography variant="body2" color="textSecondary">
            Set-up not checked{setup.checkError && `: ${setup.checkError}`}
          </Typography>
        )}
      </InfoCard>
    </Box>
  );
}
