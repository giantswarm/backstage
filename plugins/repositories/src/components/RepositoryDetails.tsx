import { Button, Chip, Grid, Typography } from '@material-ui/core';
import RefreshIcon from '@material-ui/icons/Refresh';
import { Link, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InventoryRecord, repositoriesApiRef } from '../apis';
import { RowActions } from './actions/RowActions';
import { RepositoriesErrorAlert } from './RepositoriesErrorAlert';
import { SetupSteps } from './SetupSteps';

/** A set-up still converging is re-read this often: the steps update live. */
const CONVERGING_POLL_MS = 15_000;

const catalogEntityPath = (name: string) =>
  `/catalog/default/component/${name}`;

function Fact({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === '') {
    return null;
  }
  return (
    <Grid item xs={6} md={3}>
      <Typography variant="caption" color="textSecondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Grid>
  );
}

const date = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

/**
 * The expanded row: the full inventory record of one repository as
 * `get_repository` returns it -- declaration, GitHub reality, Renovate,
 * CircleCI, catalog and mapping, the orphan reasons, every finding with its
 * fix, the set-up steps (live while they converge), the last reconciler run
 * and the record's age with Refresh.
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

  return (
    <div data-testid={`record-${record.name}`}>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs>
          <Typography variant="body2" color="textSecondary">
            Record from {record.source}, {record.age} old
            {refresh.isError && (
              <> — refresh failed: {(refresh.error as Error).message}</>
            )}
          </Typography>
        </Grid>
        <Grid item>
          <RowActions record={record} onChanged={changed} />
        </Grid>
        <Grid item>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </Grid>
      </Grid>

      <Typography variant="body2" style={{ marginTop: 8 }}>
        {reality && (
          <Link to={reality.url} target="_blank" rel="noopener">
            Repository
          </Link>
        )}
        {record.catalog.present && (
          <>
            {' · '}
            <Link to={catalogEntityPath(record.name)}>Catalog entity</Link>
          </>
        )}
        {setup.lastRun && (
          <>
            {' · '}
            <Link to={setup.lastRun.runUrl} target="_blank" rel="noopener">
              Last reconciler run ({date(setup.lastRun.timestamp)})
            </Link>
          </>
        )}
        {reality?.latestRelease && (
          <>
            {' · '}
            <Link
              to={`${reality.url}/releases/tag/${reality.latestRelease.tag}`}
              target="_blank"
              rel="noopener"
            >
              Release {reality.latestRelease.tag}
            </Link>
          </>
        )}
      </Typography>

      <Grid container spacing={2} style={{ marginTop: 8 }}>
        <Fact label="Team" value={declaration?.team ?? 'unassigned'} />
        <Fact label="Declared in" value={declaration?.file} />
        <Fact label="Component type" value={declaration?.componentType} />
        <Fact
          label="Language"
          value={declaration?.language ?? reality?.language}
        />
        <Fact label="Flavours" value={declaration?.flavours?.join(', ')} />
        <Fact label="Lifecycle" value={declaration?.lifecycle} />
        <Fact label="Visibility" value={reality?.visibility} />
        <Fact label="Default branch" value={reality?.defaultBranch} />
        <Fact
          label="Last commit"
          value={
            reality?.lastCommit
              ? `${date(reality.lastCommit.date)} by ${reality.lastCommit.author}`
              : undefined
          }
        />
        <Fact
          label="Last person commit"
          value={
            reality?.lastPersonCommit
              ? `${date(reality.lastPersonCommit.date)} by ${reality.lastPersonCommit.author}`
              : undefined
          }
        />
        <Fact
          label="Open PRs (people / bots)"
          value={
            reality
              ? `${reality.openPullRequests.people} / ${reality.openPullRequests.bots}`
              : undefined
          }
        />
        <Fact label="Open issues" value={reality?.openIssues} />
        <Fact
          label="Renovate"
          value={
            renovate.configured
              ? `${renovate.path}${renovate.enabled ? '' : ' (disabled)'}${renovate.preset ? ', preset' : ''}`
              : 'not configured'
          }
        />
        <Fact
          label="CircleCI"
          value={
            circleci &&
            (circleci.followed
              ? `followed${circleci.lastPipeline ? `, pipeline #${circleci.lastPipeline.number} ${circleci.lastPipeline.state}` : ''}`
              : 'not followed')
          }
        />
        <Fact
          label="Catalog"
          value={record.catalog.present ? 'present' : 'missing'}
        />
        <Fact
          label="Team mapping"
          value={record.mapping.present ? record.mapping.team : 'missing'}
        />
        <Fact
          label="CODEOWNERS teams"
          value={reality?.codeownersTeams?.join(', ')}
        />
        <Fact label="Orphan score" value={record.orphan.score} />
      </Grid>

      {record.orphan.reasons.length > 0 && (
        <div style={{ marginTop: 8 }} data-testid="orphan-reasons">
          {record.orphan.reasons.map(reason => (
            <Chip
              key={reason}
              size="small"
              label={reason}
              style={{ margin: 2 }}
            />
          ))}
        </div>
      )}

      {record.decision && (
        <Typography variant="body2" style={{ marginTop: 8 }}>
          Decision: {record.decision.verdict} by {record.decision.by} on{' '}
          {date(record.decision.at)}
          {record.decision.note && ` — ${record.decision.note}`}
        </Typography>
      )}

      {declaration?.problems && declaration.problems.length > 0 && (
        <Typography variant="body2" color="error" style={{ marginTop: 8 }}>
          Declaration refused: {declaration.problems.join('; ')}
        </Typography>
      )}

      {record.findings.length > 0 && (
        <div style={{ marginTop: 8 }} data-testid="record-findings">
          <Typography variant="subtitle2">Findings</Typography>
          <ul>
            {record.findings.map((finding, index) => (
              <li key={`${finding.kind}-${index}`}>
                [{finding.kind}] {finding.message}
                {finding.fix && (
                  <Typography variant="body2" color="textSecondary">
                    fix: {finding.fix}
                  </Typography>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        {setup.checks ? (
          <SetupSteps result={setup.checks} title="Set-up" />
        ) : (
          <Typography variant="body2" color="textSecondary">
            Set-up not checked{setup.checkError && `: ${setup.checkError}`}
          </Typography>
        )}
      </div>
    </div>
  );
}
