import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Flex, List, ListRow } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { EmptyState, Progress } from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { useQueries, useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../../apis';
import { formatDate } from '../../lib/dates';
import { pullRouteRef } from '../../routes';
import { EpicChip } from '../EpicChip';

// bui only applies row affordances (pointer, hover/press background, padding)
// to selection lists. This is an action list — clicking a row navigates — so
// re-apply the same affordances (matching bui's own selection-mode values) to
// make the rows read as interactive.
const useStyles = makeStyles({
  list: {
    '& .bui-ListRow': {
      cursor: 'pointer',
      paddingBlock: 'var(--bui-space-2)',
      paddingInline: 'var(--bui-space-2)',
      '&[data-hovered], &[data-focus-visible]': {
        backgroundColor: 'var(--bui-bg-neutral-1-hover)',
      },
      '&[data-pressed]': {
        backgroundColor: 'var(--bui-bg-neutral-1-pressed)',
      },
    },
  },
});

/**
 * Open pull requests against the plan repository -- plans proposed for team
 * review. A full-width list; selecting a PR navigates to its review page
 * (`/plans/pr/:number?repo=...`), which is where documents are read and
 * commented on.
 */
export function ProposedTab({ repo }: { repo: string }) {
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);
  const pullLink = useRouteRef(pullRouteRef);
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'pulls', repo],
    queryFn: () => plansApi.listPulls(repo),
  });

  const pulls = data?.pulls ?? [];

  // Epic references per open PR, for the cross-link chips. Failure just
  // means no chips.
  const { data: epicsData } = useQuery({
    queryKey: ['plans', 'epics', repo],
    queryFn: () => plansApi.listEpics(repo),
    retry: false,
  });
  const epicByPull = useMemo(
    () => new Map((epicsData?.pulls ?? []).map(entry => [entry.number, entry])),
    [epicsData],
  );

  // Changed-file counts for the list. Same query keys as the review page,
  // so opening a PR reuses these cache entries instead of refetching.
  const fileQueries = useQueries({
    queries: pulls.map(pull => ({
      queryKey: ['plans', 'pull-files', repo, pull.number],
      queryFn: () => plansApi.listPullFiles(pull.number, repo),
    })),
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return (
      <Alert
        status="danger"
        title="Failed to load proposed plans"
        description={(error as Error).message}
      />
    );
  }

  if (pulls.length === 0) {
    return (
      <EmptyState
        missing="content"
        title="No proposed plans"
        description={`There are no open pull requests in ${repo}.`}
      />
    );
  }

  return (
    <List
      aria-label="Proposed plans"
      className={classes.list}
      onAction={key => {
        const to = `${pullLink?.({ number: String(key) }) ?? '#'}?repo=${encodeURIComponent(repo)}`;
        navigate(to);
      }}
    >
      {pulls.map((pull, index) => {
        const fileCount = fileQueries[index]?.data?.files.length;
        const updated = formatDate(pull.updatedAt);
        const secondary = [
          `#${pull.number}`,
          pull.author,
          fileCount !== undefined
            ? `${fileCount} file${fileCount === 1 ? '' : 's'} changed`
            : undefined,
          updated ? `updated ${updated}` : undefined,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <ListRow
            key={pull.number}
            id={String(pull.number)}
            textValue={pull.title}
            description={secondary}
            customActions={
              epicByPull.has(pull.number) ? (
                <EpicChip epic={epicByPull.get(pull.number)!.epic} />
              ) : undefined
            }
          >
            <Flex align="center" gap="2">
              {pull.title}
              {pull.draft && <Badge size="small">Draft</Badge>}
            </Flex>
          </ListRow>
        );
      })}
    </List>
  );
}
