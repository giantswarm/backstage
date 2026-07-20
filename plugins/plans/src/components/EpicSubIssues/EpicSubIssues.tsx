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
import { EpicRef } from '../../apis';
import { useRoadmapFetch } from '../../hooks/useRoadmapFetch';

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
 * EpicChip, the roadmap plugin's backend is queried directly (via
 * `useRoadmapFetch`) to avoid coupling the plugin packages; portals without the
 * roadmap plugin render nothing via the failed query.
 */
export function EpicSubIssues({ epic }: { epic: EpicRef }) {
  const classes = useStyles();

  const { data } = useRoadmapFetch<SubIssuesResponse>({
    path: ['issues', epic.owner, epic.repo, epic.number, 'sub-issues'],
    queryKey: ['plans', 'epic-sub-issues', epic.owner, epic.repo, epic.number],
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
