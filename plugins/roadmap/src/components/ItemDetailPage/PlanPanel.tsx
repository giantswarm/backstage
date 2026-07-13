import { Box, Divider, Typography, makeStyles, Theme } from '@material-ui/core';
import { Link } from '@backstage/core-components';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  plansPullExternalRouteRef,
  plansRootExternalRouteRef,
} from '../../routes';

const useStyles = makeStyles((theme: Theme) => ({
  divider: {
    margin: theme.spacing(2, 0),
  },
  title: {
    marginBottom: theme.spacing(1),
  },
  entry: {
    marginBottom: theme.spacing(0.5),
  },
}));

/** Epic reference parsed by plans-backend from a plan's PRD header. */
interface EpicRef {
  owner: string;
  repo: string;
  number: number;
}

interface RepoEpics {
  repo: string;
  merged: Array<{ folder: string; epic: EpicRef }>;
  pulls: Array<{ number: number; title: string; epic: EpicRef }>;
}

/**
 * Sidebar section linking an epic to the plan(s) that reference it via the
 * `**Epic:**` PRD header -- merged plans and open plan PRs across all
 * configured plan repositories. Renders nothing when no plan matches or the
 * plans plugin is not deployed.
 */
export function PlanPanel({
  owner,
  repo,
  issueNumber,
}: {
  owner: string;
  repo: string;
  issueNumber: number;
}) {
  const classes = useStyles();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const plansRoot = useRouteRef(plansRootExternalRouteRef);
  const plansPull = useRouteRef(plansPullExternalRouteRef);

  // The plans plugin's backend is queried directly (instead of through its
  // frontend API) to avoid coupling the plugin packages; portals without
  // the plans plugin just get a failed query and no panel.
  const { data } = useQuery({
    queryKey: ['roadmap', 'plan-epics'],
    queryFn: async (): Promise<RepoEpics[]> => {
      const baseUrl = await discoveryApi.getBaseUrl('plans');
      const reposResponse = await fetchApi.fetch(`${baseUrl}/repos`);
      if (!reposResponse.ok) {
        throw new Error(
          `Plans lookup failed with status ${reposResponse.status}`,
        );
      }
      const { repositories } = (await reposResponse.json()) as {
        repositories: string[];
      };
      const results = await Promise.all(
        repositories.map(async planRepo => {
          const response = await fetchApi.fetch(
            `${baseUrl}/epics?repo=${encodeURIComponent(planRepo)}`,
          );
          if (!response.ok) {
            return null;
          }
          const epics = (await response.json()) as Omit<RepoEpics, 'repo'>;
          return { repo: planRepo, ...epics };
        }),
      );
      return results.filter(result => result !== null);
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  const matchesEpic = (epic: EpicRef) =>
    epic.owner === owner && epic.repo === repo && epic.number === issueNumber;
  const merged = (data ?? []).flatMap(repoEpics =>
    repoEpics.merged
      .filter(entry => matchesEpic(entry.epic))
      .map(entry => ({ repo: repoEpics.repo, folder: entry.folder })),
  );
  const proposed = (data ?? []).flatMap(repoEpics =>
    repoEpics.pulls
      .filter(entry => matchesEpic(entry.epic))
      .map(entry => ({ repo: repoEpics.repo, number: entry.number })),
  );

  if (merged.length === 0 && proposed.length === 0) {
    return null;
  }

  return (
    <>
      <Divider className={classes.divider} />
      <Typography className={classes.title} variant="subtitle1">
        Plan
      </Typography>
      {merged.map(plan => (
        <Box key={`${plan.repo}/${plan.folder}`} className={classes.entry}>
          <Link
            to={
              plansRoot
                ? `${plansRoot()}?repo=${encodeURIComponent(plan.repo)}&plan=${encodeURIComponent(plan.folder)}`
                : `https://github.com/${plan.repo}/tree/HEAD/${plan.folder}`
            }
          >
            {plan.folder}
          </Link>
        </Box>
      ))}
      {proposed.map(pull => (
        <Box key={`${pull.repo}#${pull.number}`} className={classes.entry}>
          <Link
            to={
              plansPull
                ? `${plansPull({ number: String(pull.number) })}?repo=${encodeURIComponent(pull.repo)}`
                : `https://github.com/${pull.repo}/pull/${pull.number}`
            }
          >
            proposed in {pull.repo}#{pull.number}
          </Link>
        </Box>
      ))}
    </>
  );
}
