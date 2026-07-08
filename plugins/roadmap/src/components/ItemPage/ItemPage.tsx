import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Paper,
  TextField,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import LinkOffIcon from '@material-ui/icons/LinkOff';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { Alert } from '@material-ui/lab';
import { Content, MarkdownContent, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { alertApiRef, configApiRef } from '@backstage/core-plugin-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roadmapApiRef, SubIssue } from '../../apis';
import {
  AVAILABILITY_FIELD,
  fieldOptions,
  KIND_FIELD,
  parseRepoSlug,
  QUARTER_FIELD,
  STATUS_FIELD,
  TEAM_FIELD,
} from '../../lib/board';
import { findPlanLinks, planPagePath } from '../../lib/planLinks';

const EDITABLE_FIELDS = [
  STATUS_FIELD,
  KIND_FIELD,
  TEAM_FIELD,
  AVAILABILITY_FIELD,
  QUARTER_FIELD,
];

const useStyles = makeStyles((theme: Theme) => ({
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  panel: {
    padding: theme.spacing(2),
  },
  fieldSelect: {
    marginBottom: theme.spacing(2),
  },
  planChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  body: {
    '& img': {
      maxWidth: '100%',
    },
    overflowWrap: 'anywhere',
  },
  addForm: {
    display: 'flex',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  meta: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
  },
}));

/**
 * Board item detail: issue body, editable board fields, the sub-issue tree
 * (with link/unlink), and in-portal links to plans referencing this epic.
 */
export function ItemPage() {
  const classes = useStyles();
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const roadmapApi = useApi(roadmapApiRef);
  const alertApi = useApi(alertApiRef);
  const configApi = useApi(configApiRef);
  const queryClient = useQueryClient();
  const [newChild, setNewChild] = useState('');

  const planRepositories =
    configApi.getOptionalStringArray('plans.repositories') ?? [];

  const schemaQuery = useQuery({
    queryKey: ['roadmap', 'schema'],
    queryFn: () => roadmapApi.getSchema(),
  });

  const itemQuery = useQuery({
    queryKey: ['roadmap', 'item', itemId],
    queryFn: () => roadmapApi.getItem(itemId),
    enabled: itemId !== '',
  });

  const item = itemQuery.data?.item;
  const repoSlug = parseRepoSlug(item?.repository?.nameWithOwner);
  const issueNumber = typeof item?.number === 'number' ? item.number : null;

  const subIssuesQuery = useQuery({
    queryKey: [
      'roadmap',
      'sub-issues',
      item?.repository?.nameWithOwner,
      issueNumber,
    ],
    queryFn: () =>
      roadmapApi.getSubIssues(repoSlug!.owner, repoSlug!.repo, issueNumber!),
    enabled: Boolean(repoSlug && issueNumber),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['roadmap'] });

  const onError = (prefix: string) => (mutationError: unknown) => {
    alertApi.post({
      message: `${prefix}: ${(mutationError as Error).message}`,
      severity: 'error',
    });
  };

  const fieldMutation = useMutation({
    mutationFn: ({ name, value }: { name: string; value: string }) =>
      roadmapApi.updateItemField(itemId, name, value),
    onSuccess: invalidate,
    onError: onError('Failed to update field'),
  });

  const addChildMutation = useMutation({
    mutationFn: (child: string) =>
      roadmapApi.addSubIssue(
        repoSlug!.owner,
        repoSlug!.repo,
        issueNumber!,
        child,
      ),
    onSuccess: () => {
      setNewChild('');
      invalidate();
    },
    onError: onError('Failed to link sub-issue'),
  });

  const removeChildMutation = useMutation({
    mutationFn: (subIssueId: number) =>
      roadmapApi.removeSubIssue(
        repoSlug!.owner,
        repoSlug!.repo,
        issueNumber!,
        subIssueId,
      ),
    onSuccess: invalidate,
    onError: onError('Failed to unlink sub-issue'),
  });

  /** Navigate to an issue's board item, falling back to GitHub. */
  const openIssue = async (issue: SubIssue) => {
    try {
      const { itemId: targetId } = await roadmapApi.resolveItem(issue.htmlUrl);
      navigate(`../item/${encodeURIComponent(targetId)}`);
    } catch {
      window.open(issue.htmlUrl, '_blank', 'noopener');
    }
  };

  if (itemQuery.isLoading || schemaQuery.isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }
  if (itemQuery.error || !item) {
    return (
      <Content>
        <Alert severity="error">
          {(itemQuery.error as Error | undefined)?.message ?? 'Item not found'}
        </Alert>
      </Content>
    );
  }

  const fields = schemaQuery.data?.fields;
  const fieldValue = (name: string) =>
    item.fields.find(field => field.name.toLowerCase() === name.toLowerCase())
      ?.value ?? '';
  const planLinks = findPlanLinks(item.body ?? '', planRepositories);
  const subIssues = subIssuesQuery.data?.subIssues ?? [];
  const parent = subIssuesQuery.data?.parent ?? null;

  return (
    <Content>
      <Box className={classes.header}>
        <IconButton component={RouterLink} to=".." size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">{item.title}</Typography>
        {item.url && (
          <Tooltip title="Open on GitHub">
            <IconButton
              size="small"
              href={item.url}
              target="_blank"
              rel="noopener"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Typography variant="body2" className={classes.meta}>
        {item.repository?.nameWithOwner}
        {issueNumber ? `#${issueNumber}` : ''}
        {item.author && ` · opened by ${item.author}`}
        {item.assignees.length > 0 &&
          ` · assigned to ${item.assignees.join(', ')}`}
        {item.closedAt && ' · closed'}
      </Typography>
      {planLinks.length > 0 && (
        <Box className={classes.planChips}>
          {planLinks.map(link => (
            <Chip
              key={link.url}
              color="primary"
              variant="outlined"
              label={`Plan: ${link.planDir ?? `${link.repo.split('/').pop()}#${link.pullNumber}`}`}
              component={RouterLink}
              to={planPagePath(link)}
              clickable
            />
          ))}
        </Box>
      )}
      <Grid container spacing={2} alignItems="flex-start">
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" className={classes.panel}>
            <Box className={classes.body}>
              <MarkdownContent
                content={item.body || '_No description._'}
                dialect="gfm"
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" className={classes.panel}>
            <Typography variant="subtitle2" gutterBottom>
              Board fields
            </Typography>
            {EDITABLE_FIELDS.map(name => {
              const options = fieldOptions(fields, name);
              if (options.length === 0) {
                return null;
              }
              return (
                <TextField
                  key={name}
                  className={classes.fieldSelect}
                  select
                  fullWidth
                  size="small"
                  variant="outlined"
                  label={name}
                  value={fieldValue(name)}
                  disabled={fieldMutation.isPending}
                  onChange={event =>
                    fieldMutation.mutate({ name, value: event.target.value })
                  }
                >
                  {options.map(option => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
              );
            })}
            {parent && (
              <>
                <Typography variant="subtitle2" gutterBottom>
                  Parent
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <Link component="button" onClick={() => openIssue(parent)}>
                    #{parent.number} {parent.title}
                  </Link>
                </Typography>
              </>
            )}
          </Paper>
          {repoSlug && issueNumber && (
            <Box mt={2}>
              <Paper variant="outlined" className={classes.panel}>
                <Typography variant="subtitle2" gutterBottom>
                  Sub-issues ({subIssues.length})
                </Typography>
                {subIssuesQuery.isLoading && <Progress />}
                <List dense disablePadding>
                  {subIssues.map(subIssue => (
                    <ListItem
                      key={subIssue.id}
                      button
                      disableGutters
                      onClick={() => openIssue(subIssue)}
                    >
                      <ListItemText
                        primary={`#${subIssue.number} ${subIssue.title}`}
                        secondary={[
                          subIssue.state,
                          ...(subIssue.assignees ?? []),
                        ].join(' · ')}
                      />
                      <ListItemSecondaryAction>
                        <Tooltip title="Unlink sub-issue">
                          <IconButton
                            edge="end"
                            size="small"
                            disabled={removeChildMutation.isPending}
                            onClick={() =>
                              removeChildMutation.mutate(subIssue.id)
                            }
                          >
                            <LinkOffIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
                <Box className={classes.addForm}>
                  <TextField
                    fullWidth
                    size="small"
                    variant="outlined"
                    label="Issue URL or owner/repo#N"
                    value={newChild}
                    onChange={event => setNewChild(event.target.value)}
                  />
                  <Button
                    variant="outlined"
                    disabled={
                      newChild.trim() === '' || addChildMutation.isPending
                    }
                    onClick={() => addChildMutation.mutate(newChild.trim())}
                  >
                    Link
                  </Button>
                </Box>
              </Paper>
            </Box>
          )}
        </Grid>
      </Grid>
    </Content>
  );
}
