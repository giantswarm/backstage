import { FormEvent, useState } from 'react';
import {
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import LinkOffIcon from '@material-ui/icons/LinkOff';
import { Link, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { roadmapApiRef } from '../../apis';

const useStyles = makeStyles((theme: Theme) => ({
  addForm: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1.5),
  },
  addInput: {
    flexGrow: 1,
  },
  stateChip: {
    height: 20,
    fontSize: 11,
    marginRight: theme.spacing(1),
  },
  parentNote: {
    marginBottom: theme.spacing(1),
  },
}));

/**
 * The sub-issue tree of an epic: parent link, children with state and
 * assignees, unlink buttons, and a form to link an existing issue (URL or
 * owner/repo#N). Link/unlink are writes and run with the caller's GitHub
 * token; GitHub's own permission errors surface inline.
 */
export function SubIssuesPanel(props: {
  owner: string;
  repo: string;
  issueNumber: number;
}) {
  const { owner, repo, issueNumber } = props;
  const classes = useStyles();
  const roadmapApi = useApi(roadmapApiRef);
  const queryClient = useQueryClient();
  const [child, setChild] = useState('');

  const queryKey = ['roadmap', 'sub-issues', owner, repo, issueNumber];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => roadmapApi.listSubIssues(owner, repo, issueNumber),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addSubIssue = useMutation({
    mutationFn: (reference: string) =>
      roadmapApi.addSubIssue(owner, repo, issueNumber, reference),
    onSuccess: () => {
      setChild('');
      invalidate();
    },
  });

  const removeSubIssue = useMutation({
    mutationFn: (subIssueId: number) =>
      roadmapApi.removeSubIssue(owner, repo, issueNumber, subIssueId),
    onSuccess: invalidate,
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const reference = child.trim();
    if (reference) {
      addSubIssue.mutate(reference);
    }
  };

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }

  const subIssues = data?.subIssues ?? [];
  const parent = data?.parent;
  const mutationError = addSubIssue.error ?? removeSubIssue.error;

  return (
    <>
      {parent && (
        <Typography
          className={classes.parentNote}
          variant="body2"
          color="textSecondary"
        >
          Part of{' '}
          <Link to={parent.htmlUrl}>
            {parent.repo ?? ''}#{parent.number} {parent.title}
          </Link>
        </Typography>
      )}
      {mutationError ? (
        <Alert
          severity="error"
          onClose={() => {
            addSubIssue.reset();
            removeSubIssue.reset();
          }}
        >
          {(mutationError as Error).message}
        </Alert>
      ) : null}
      {subIssues.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No sub-issues linked yet.
        </Typography>
      ) : (
        <List dense disablePadding>
          {subIssues.map(issue => (
            <ListItem key={issue.id} divider disableGutters>
              <ListItemText
                primary={
                  <>
                    <Chip
                      className={classes.stateChip}
                      size="small"
                      variant="outlined"
                      label={issue.state}
                    />
                    <Link to={issue.htmlUrl}>
                      {issue.repo ?? ''}#{issue.number} {issue.title}
                    </Link>
                  </>
                }
                secondary={
                  issue.assignees.length > 0
                    ? issue.assignees.map(login => `@${login}`).join(', ')
                    : undefined
                }
              />
              <ListItemSecondaryAction>
                <Tooltip title="Unlink sub-issue">
                  <IconButton
                    edge="end"
                    size="small"
                    aria-label="Unlink sub-issue"
                    disabled={removeSubIssue.isPending}
                    onClick={() => removeSubIssue.mutate(issue.id)}
                  >
                    <LinkOffIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}
      <form className={classes.addForm} onSubmit={onSubmit}>
        <TextField
          className={classes.addInput}
          size="small"
          variant="outlined"
          label="Link existing issue"
          placeholder="https://github.com/owner/repo/issues/N or owner/repo#N"
          value={child}
          onChange={event => setChild(event.target.value)}
        />
        <Button
          type="submit"
          variant="outlined"
          color="primary"
          disabled={!child.trim() || addSubIssue.isPending}
        >
          Link
        </Button>
      </form>
    </>
  );
}
