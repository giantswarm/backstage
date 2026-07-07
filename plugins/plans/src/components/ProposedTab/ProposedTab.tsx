import { useState } from 'react';
import {
  Box,
  Chip,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Switch,
  FormControlLabel,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import {
  CodeSnippet,
  EmptyState,
  Link,
  MarkdownContent,
  Progress,
} from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { PlanPull, PlanPullFile, plansApiRef } from '../../apis';
import { isRenderableFile } from '../../lib/files';
import { PlanFileContent } from '../PlanFileContent';

const useStyles = makeStyles((theme: Theme) => ({
  listPanel: {
    padding: 0,
  },
  detailPanel: {
    padding: theme.spacing(2),
  },
  pullMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  body: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
  fileSection: {
    marginTop: theme.spacing(3),
  },
  fileHeader: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  fileName: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 600,
    flexGrow: 1,
  },
  diffStat: {
    fontSize: 12,
    color: theme.palette.text.secondary,
  },
  fileBody: {
    marginTop: theme.spacing(1),
  },
  placeholder: {
    padding: theme.spacing(4),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
}));

function formatUpdatedAt(updatedAt?: string): string | undefined {
  if (!updatedAt) {
    return undefined;
  }
  const date = new Date(updatedAt);
  if (isNaN(date.getTime())) {
    return undefined;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function PullFileSection(props: {
  repo: string;
  branch?: string;
  file: PlanPullFile;
}) {
  const { repo, branch, file } = props;
  const classes = useStyles();
  const [showDiff, setShowDiff] = useState(false);

  // Deleted files have no head-branch content; renderable added/modified
  // files default to the rendered document, everything else to the diff.
  const renderable =
    file.status !== 'removed' && isRenderableFile(file.filename) && branch;

  let body;
  if (renderable && !showDiff) {
    body = (
      <PlanFileContent repo={repo} refName={branch!} path={file.filename} />
    );
  } else if (file.patch) {
    body = <CodeSnippet text={file.patch} language="diff" />;
  } else {
    body = (
      <Typography variant="body2" color="textSecondary">
        No diff available for this file.
      </Typography>
    );
  }

  return (
    <Box className={classes.fileSection}>
      <Box className={classes.fileHeader}>
        <span className={classes.fileName}>{file.filename}</span>
        <Chip size="small" variant="outlined" label={file.status} />
        <span className={classes.diffStat}>
          +{file.additions} −{file.deletions}
        </span>
        {renderable && file.patch && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showDiff}
                onChange={event => setShowDiff(event.target.checked)}
              />
            }
            label="Diff"
          />
        )}
      </Box>
      <Box className={classes.fileBody}>{body}</Box>
    </Box>
  );
}

function PullDetail(props: { repo: string; pull: PlanPull }) {
  const { repo, pull } = props;
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'pull-files', repo, pull.number],
    queryFn: () => plansApi.listPullFiles(pull.number, repo),
  });

  const updated = formatUpdatedAt(pull.updatedAt);

  return (
    <>
      <Typography variant="h5">{pull.title}</Typography>
      <Box className={classes.pullMeta}>
        {pull.draft && <Chip size="small" label="Draft" />}
        <Typography variant="body2" color="textSecondary">
          <Link to={`https://github.com/${repo}/pull/${pull.number}`}>
            {repo}#{pull.number}
          </Link>
          {pull.author && ` by ${pull.author}`}
          {updated && ` · updated ${updated}`}
        </Typography>
      </Box>
      {pull.body && (
        <Box className={classes.body}>
          <MarkdownContent content={pull.body} dialect="gfm" />
        </Box>
      )}
      <Divider />

      {isLoading && <Progress />}
      {error ? (
        <Alert severity="error">{(error as Error).message}</Alert>
      ) : null}
      {data?.files.length === 0 && (
        <Typography variant="body2" color="textSecondary">
          This pull request changes no files.
        </Typography>
      )}
      {data?.files.map(file => (
        <PullFileSection
          key={file.filename}
          repo={repo}
          branch={pull.branch}
          file={file}
        />
      ))}
    </>
  );
}

/**
 * Open pull requests against the plan repository -- plans proposed for team
 * review. Selecting a PR renders its changed documents from the head branch,
 * with a per-file toggle to the GitHub patch instead.
 */
export function ProposedTab({ repo }: { repo: string }) {
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);
  const [selected, setSelected] = useState<number | undefined>(undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'pulls', repo],
    queryFn: () => plansApi.listPulls(repo),
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }

  const pulls = data?.pulls ?? [];
  if (pulls.length === 0) {
    return (
      <EmptyState
        missing="content"
        title="No proposed plans"
        description={`There are no open pull requests in ${repo}.`}
      />
    );
  }

  const selectedPull = pulls.find(pull => pull.number === selected) ?? pulls[0];

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <Paper className={classes.listPanel} variant="outlined">
          <List disablePadding>
            {pulls.map(pull => (
              <ListItem
                key={pull.number}
                button
                divider
                selected={pull.number === selectedPull.number}
                onClick={() => setSelected(pull.number)}
              >
                <ListItemText
                  primary={pull.title}
                  secondary={[
                    `#${pull.number}`,
                    pull.author,
                    pull.draft ? 'draft' : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Grid>
      <Grid item xs={12} md={8}>
        <Paper className={classes.detailPanel} variant="outlined">
          <PullDetail
            key={`${repo}/${selectedPull.number}`}
            repo={repo}
            pull={selectedPull}
          />
        </Paper>
      </Grid>
    </Grid>
  );
}
