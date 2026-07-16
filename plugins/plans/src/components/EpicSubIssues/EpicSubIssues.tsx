import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Link } from '@backstage/core-components';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { EpicRef } from '../../apis';

/** The slice of a GitHub issue the panel needs (roadmap backend REST shape). */
interface SubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  assignees: string[];
  repo?: string;
}

interface SubIssuesResponse {
  subIssues: SubIssue[];
  /** The queried epic issue itself, for its own metadata (assignees, state). */
  epic: SubIssue | null;
}

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1.5),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  assignees: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    flexWrap: 'wrap',
  },
  assigneeChip: {
    height: 20,
    fontSize: 11,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
    marginTop: theme.spacing(0.5),
  },
  issueRef: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  unassigned: {
    fontStyle: 'italic',
  },
}));

/** Small `@login` chips, or an italic "Unassigned" when there are none. */
function Assignees({ logins }: { logins: string[] }) {
  const classes = useStyles();
  if (logins.length === 0) {
    return (
      <Typography
        component="span"
        variant="caption"
        color="textSecondary"
        className={classes.unassigned}
      >
        Unassigned
      </Typography>
    );
  }
  return (
    <span className={classes.assignees}>
      {logins.map(login => (
        <Chip
          key={login}
          className={classes.assigneeChip}
          size="small"
          variant="outlined"
          label={`@${login}`}
        />
      ))}
    </span>
  );
}

/**
 * The implementation issues of the plan's epic, from GitHub's sub-issue
 * hierarchy, with the assignees of the epic and each sub-issue. Like
 * EpicChip, the roadmap plugin's backend is queried directly (instead of
 * through its frontend API) to avoid coupling the plugin packages; portals
 * without the roadmap plugin render nothing via the failed query.
 */
export function EpicSubIssues({ epic }: { epic: EpicRef }) {
  const classes = useStyles();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const { data } = useQuery({
    queryKey: ['plans', 'epic-sub-issues', epic.owner, epic.repo, epic.number],
    queryFn: async (): Promise<SubIssuesResponse> => {
      const baseUrl = await discoveryApi.getBaseUrl('roadmap');
      const response = await fetchApi.fetch(
        `${baseUrl}/issues/${encodeURIComponent(epic.owner)}/${encodeURIComponent(epic.repo)}/${epic.number}/sub-issues`,
      );
      if (!response.ok) {
        throw new Error(
          `Sub-issue lookup failed with status ${response.status}`,
        );
      }
      return response.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  const subIssues = data?.subIssues ?? [];
  if (subIssues.length === 0) {
    return null;
  }

  const closed = subIssues.filter(issue => issue.state === 'closed').length;

  return (
    <Box className={classes.root}>
      <Box className={classes.header}>
        <Typography variant="subtitle2">Epic sub-issues</Typography>
        <Chip
          size="small"
          variant="outlined"
          label={`${closed}/${subIssues.length} done`}
        />
      </Box>
      {data?.epic && (
        <Box className={classes.meta}>
          <Typography variant="caption" color="textSecondary">
            Epic assignees:
          </Typography>
          <Assignees logins={data.epic.assignees} />
        </Box>
      )}
      <List dense disablePadding>
        {subIssues.map(issue => (
          <ListItem key={issue.id} disableGutters>
            <ListItemText
              disableTypography
              primary={<Link to={issue.htmlUrl}>{issue.title}</Link>}
              secondary={
                <span className={classes.meta}>
                  <Typography
                    component="span"
                    color="textSecondary"
                    className={classes.issueRef}
                  >
                    {issue.repo ?? `${epic.owner}/${epic.repo}`}#{issue.number}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    color="textSecondary"
                  >
                    {issue.state}
                  </Typography>
                  <Assignees logins={issue.assignees} />
                </span>
              }
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
