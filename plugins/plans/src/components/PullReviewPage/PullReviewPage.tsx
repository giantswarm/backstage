import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert, ToggleButton, ToggleButtonGroup } from '@material-ui/lab';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import {
  Content,
  EmptyState,
  Link,
  MarkdownContent,
  Progress,
} from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  NewReviewComment,
  PlanPull,
  PlanPullFile,
  PlanReviewComment,
  plansApiRef,
} from '../../apis';
import { formatDate } from '../../lib/dates';
import { firstHeading, isHtmlFile, isMarkdownFile } from '../../lib/files';
import { rootRouteRef } from '../../routes';
import { AnnotatedMarkdown } from '../AnnotatedMarkdown';
import { CommentForm, CommentItem } from '../Comments';
import { DiffView } from '../ProposedTab/DiffView';

const NAV_WIDTH = 260;
const READING_WIDTH = 860;

const useStyles = makeStyles((theme: Theme) => ({
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    fontSize: 13,
    marginBottom: theme.spacing(1),
  },
  header: {
    marginBottom: theme.spacing(2),
  },
  headerMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginTop: theme.spacing(0.5),
  },
  layout: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(3),
  },
  nav: {
    width: NAV_WIDTH,
    flexShrink: 0,
    position: 'sticky',
    top: theme.spacing(2),
  },
  navItemText: {
    '& .MuiListItemText-primary': {
      fontSize: 14,
    },
    '& .MuiListItemText-secondary': {
      fontSize: 11,
      fontFamily: 'monospace',
      wordBreak: 'break-all',
    },
  },
  countBadge: {
    height: 20,
    fontSize: 11,
    marginLeft: theme.spacing(1),
  },
  statusDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginRight: theme.spacing(1),
    flexShrink: 0,
  },
  added: {
    backgroundColor: theme.palette.success.main,
  },
  removed: {
    backgroundColor: theme.palette.error.main,
  },
  reading: {
    flexGrow: 1,
    maxWidth: READING_WIDTH,
    minWidth: 0,
  },
  panel: {
    padding: theme.spacing(3),
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
    marginBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  toolbarSpacer: {
    flexGrow: 1,
  },
  additions: {
    fontSize: 12,
    fontWeight: 600,
    color: theme.palette.success.main,
  },
  deletions: {
    fontSize: 12,
    fontWeight: 600,
    color: theme.palette.error.main,
  },
  discussionTitle: {
    marginTop: theme.spacing(3),
    paddingTop: theme.spacing(2),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  // Colored box around the whole discussion, matching the review-thread box.
  discussion: {
    padding: theme.spacing(0.5, 1.5),
    marginTop: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.primary.main}`,
    borderLeft: `4px solid ${theme.palette.primary.main}`,
    backgroundColor: theme.palette.action.hover,
  },
  htmlFrame: {
    width: '100%',
    height: '75vh',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: '#fff',
  },
}));

const OVERVIEW = 'overview';

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/** PR body followed directly by the discussion thread and composer. */
function OverviewPanel(props: { repo: string; pull: PlanPull }) {
  const { repo, pull } = props;
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);
  const queryClient = useQueryClient();

  const commentsQueryKey = ['plans', 'pull-comments', repo, pull.number];
  const { data, isLoading, error } = useQuery({
    queryKey: commentsQueryKey,
    queryFn: () => plansApi.listPullComments(pull.number, repo),
  });

  const createComment = useMutation({
    mutationFn: (body: string) =>
      plansApi.createPullComment(pull.number, body, repo),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: commentsQueryKey }),
  });

  return (
    <>
      {pull.body ? (
        <MarkdownContent content={pull.body} dialect="gfm" />
      ) : (
        <Typography variant="body2" color="textSecondary">
          This pull request has no description.
        </Typography>
      )}
      <Typography variant="h6" className={classes.discussionTitle}>
        Discussion
      </Typography>
      {isLoading && <Progress />}
      {error ? (
        <Alert severity="error">{(error as Error).message}</Alert>
      ) : null}
      {data?.comments.length === 0 && (
        <Typography variant="body2" color="textSecondary">
          No comments yet. Start the discussion below.
        </Typography>
      )}
      {data?.comments.length ? (
        <Box className={classes.discussion}>
          {data.comments.map(comment => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </Box>
      ) : null}
      <CommentForm onSubmit={body => createComment.mutateAsync(body)} />
    </>
  );
}

/**
 * One changed document: toolbar (Rendered/Diff toggle, diff stats, status,
 * GitHub link) above the annotated reader or the diff. HTML files render in
 * a sandboxed iframe (comments only via the diff); removed files are diff
 * only.
 */
function DocumentPanel(props: {
  repo: string;
  branch?: string;
  pullNumber: number;
  file: PlanPullFile;
  comments: PlanReviewComment[];
  onCreate: (comment: NewReviewComment) => Promise<unknown>;
}) {
  const { repo, branch, pullNumber, file, comments, onCreate } = props;
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);

  const markdown = isMarkdownFile(file.filename);
  const html = isHtmlFile(file.filename);
  // Rendered view needs head-branch content, so it requires the branch and
  // a file that still exists there.
  const renderable =
    file.status !== 'removed' && !!branch && (markdown || html);

  const [view, setView] = useState<'rendered' | 'diff'>(
    renderable ? 'rendered' : 'diff',
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'content', repo, branch, file.filename],
    queryFn: () => plansApi.getContent(file.filename, branch, repo),
    enabled: renderable,
  });

  const githubUrl =
    file.status === 'removed' || !branch
      ? `https://github.com/${repo}/pull/${pullNumber}/files`
      : `https://github.com/${repo}/blob/${branch}/${file.filename}`;

  let body;
  if (view === 'rendered' && renderable) {
    if (isLoading) {
      body = <Progress />;
    } else if (error) {
      body = <Alert severity="error">{(error as Error).message}</Alert>;
    } else if (!data) {
      body = null;
    } else if (html) {
      body = (
        <iframe
          className={classes.htmlFrame}
          title={file.filename}
          sandbox="allow-scripts"
          srcDoc={data.content}
        />
      );
    } else {
      body = (
        <AnnotatedMarkdown
          content={data.content}
          file={file}
          comments={comments}
          onCreate={onCreate}
        />
      );
    }
  } else if (file.patch) {
    body = (
      <DiffView
        patch={file.patch}
        path={file.filename}
        comments={comments}
        onCreate={onCreate}
      />
    );
  } else {
    body = (
      <Typography variant="body2" color="textSecondary">
        No diff available for this file.
      </Typography>
    );
  }

  return (
    <>
      <Box className={classes.toolbar}>
        {renderable && file.patch && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_, value) => value && setView(value)}
          >
            <ToggleButton value="rendered">Rendered</ToggleButton>
            <ToggleButton value="diff">Diff</ToggleButton>
          </ToggleButtonGroup>
        )}
        {file.status !== 'modified' && (
          <Chip size="small" variant="outlined" label={file.status} />
        )}
        <span className={classes.additions}>+{file.additions}</span>
        <span className={classes.deletions}>−{file.deletions}</span>
        <Box className={classes.toolbarSpacer} />
        <Link to={githubUrl}>View on GitHub</Link>
      </Box>
      {body}
    </>
  );
}

/**
 * Full-width review page for one plan PR. The left nav lists Overview (PR
 * description + discussion) and the changed documents with pretty titles
 * and comment counts; the reading column renders one document at a time
 * with paragraph-level commenting. Selection travels in `?doc=` so document
 * positions are shareable, like the page URL itself.
 */
export function PullReviewPage() {
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);
  const queryClient = useQueryClient();
  const rootLink = useRouteRef(rootRouteRef);
  const { number } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const pullNumber = Number(number);
  const repoParam = searchParams.get('repo') ?? undefined;
  const doc = searchParams.get('doc') ?? OVERVIEW;

  const reposQuery = useQuery({
    queryKey: ['plans', 'repos'],
    queryFn: () => plansApi.listRepos(),
  });
  const repositories = reposQuery.data?.repositories ?? [];
  const repo =
    repoParam && repositories.includes(repoParam) ? repoParam : repositories[0];

  // The review page is always mounted under the plans root route, so the
  // relative fallback only fires while the route ref is not yet resolvable.
  // Carry `?repo=` back to the list so the picker keeps its selection.
  const plansPath = `${rootLink ? rootLink() : '..'}${
    repo ? `?repo=${encodeURIComponent(repo)}` : ''
  }`;

  const pullsQuery = useQuery({
    queryKey: ['plans', 'pulls', repo],
    queryFn: () => plansApi.listPulls(repo),
    enabled: !!repo,
  });
  const pull = pullsQuery.data?.pulls.find(p => p.number === pullNumber);

  const filesQuery = useQuery({
    queryKey: ['plans', 'pull-files', repo, pullNumber],
    queryFn: () => plansApi.listPullFiles(pullNumber, repo),
    enabled: !!repo,
  });
  const files = useMemo(() => filesQuery.data?.files ?? [], [filesQuery.data]);

  const reviewCommentsQueryKey = ['plans', 'review-comments', repo, pullNumber];
  const { data: reviewComments } = useQuery({
    queryKey: reviewCommentsQueryKey,
    queryFn: () => plansApi.listReviewComments(pullNumber, repo),
    enabled: !!repo,
  });

  // Shares the cache entry with OverviewPanel's query; used for the nav badge.
  const { data: discussionComments } = useQuery({
    queryKey: ['plans', 'pull-comments', repo, pullNumber],
    queryFn: () => plansApi.listPullComments(pullNumber, repo),
    enabled: !!repo,
  });

  const createReviewComment = useMutation({
    mutationFn: (comment: NewReviewComment) =>
      plansApi.createReviewComment(pullNumber, comment, repo),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: reviewCommentsQueryKey }),
  });

  // Head-branch contents of the changed markdown documents, fetched for the
  // pretty nav titles. Same query keys as DocumentPanel, so opening a
  // document reuses the cache entry instead of refetching.
  const branch = pull?.branch;
  const contentQueries = useQueries({
    queries: files.map(file => ({
      queryKey: ['plans', 'content', repo, branch, file.filename],
      queryFn: () => plansApi.getContent(file.filename, branch, repo),
      enabled:
        !!repo &&
        !!branch &&
        file.status !== 'removed' &&
        isMarkdownFile(file.filename),
    })),
  });
  // Cheap enough to recompute per render; memoizing would need the unstable
  // contentQueries array as a dependency.
  const titles = new Map<string, string>();
  files.forEach((file, index) => {
    const content = contentQueries[index]?.data?.content;
    const heading = content ? firstHeading(content) : undefined;
    titles.set(file.filename, heading ?? basename(file.filename));
  });

  const commentsByFile = useMemo(() => {
    const map = new Map<string, PlanReviewComment[]>();
    for (const comment of reviewComments?.comments ?? []) {
      if (!comment.path) {
        continue;
      }
      map.set(comment.path, [...(map.get(comment.path) ?? []), comment]);
    }
    return map;
  }, [reviewComments]);

  if (reposQuery.isLoading || pullsQuery.isLoading || filesQuery.isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }
  const loadError = reposQuery.error ?? pullsQuery.error ?? filesQuery.error;
  if (loadError) {
    return (
      <Content>
        <Alert severity="error">{(loadError as Error).message}</Alert>
      </Content>
    );
  }
  if (!repo || !pull) {
    return (
      <Content>
        <EmptyState
          missing="content"
          title="Pull request not found"
          description={`There is no open pull request #${number}${
            repo ? ` in ${repo}` : ''
          }. It may have been merged or closed.`}
          action={<Link to={plansPath}>Back to plans</Link>}
        />
      </Content>
    );
  }

  const selectDoc = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === OVERVIEW) {
      params.delete('doc');
    } else {
      params.set('doc', next);
    }
    setSearchParams(params);
  };

  const selectedFile = files.find(file => file.filename === doc);
  const updated = formatDate(pull.updatedAt);
  const discussionCount = discussionComments?.comments.length;

  const countChip = (count: number | undefined) =>
    count !== undefined && count > 0 ? (
      <Chip className={classes.countBadge} size="small" label={count} />
    ) : null;

  return (
    <Content>
      <Box className={classes.header}>
        <Link className={classes.backLink} to={plansPath}>
          <ArrowBackIcon fontSize="inherit" /> All plans
        </Link>
        <Typography variant="h4">{pull.title}</Typography>
        <Box className={classes.headerMeta}>
          {pull.draft && <Chip size="small" label="Draft" />}
          <Typography variant="body2" color="textSecondary">
            <Link to={`https://github.com/${repo}/pull/${pull.number}`}>
              {repo}#{pull.number}
            </Link>
            {pull.author && ` by ${pull.author}`}
            {updated && ` · updated ${updated}`}
          </Typography>
        </Box>
      </Box>

      <Box className={classes.layout}>
        <Paper className={classes.nav} variant="outlined">
          <List dense disablePadding>
            <ListItem
              button
              divider
              selected={doc === OVERVIEW}
              onClick={() => selectDoc(OVERVIEW)}
            >
              <ListItemText
                className={classes.navItemText}
                primary="Overview"
                secondary="Description & discussion"
              />
              {countChip(discussionCount)}
            </ListItem>
            {files.map(file => (
              <ListItem
                key={file.filename}
                button
                divider
                selected={doc === file.filename}
                onClick={() => selectDoc(file.filename)}
              >
                {file.status !== 'modified' && (
                  <span
                    className={`${classes.statusDot} ${
                      file.status === 'removed'
                        ? classes.removed
                        : classes.added
                    }`}
                    title={file.status}
                  />
                )}
                <ListItemText
                  className={classes.navItemText}
                  primary={titles.get(file.filename) ?? basename(file.filename)}
                  secondary={file.filename}
                />
                {countChip(commentsByFile.get(file.filename)?.length)}
              </ListItem>
            ))}
          </List>
        </Paper>

        <Box className={classes.reading}>
          <Paper className={classes.panel} variant="outlined">
            {selectedFile ? (
              <DocumentPanel
                key={selectedFile.filename}
                repo={repo}
                branch={pull.branch}
                pullNumber={pull.number}
                file={selectedFile}
                comments={commentsByFile.get(selectedFile.filename) ?? []}
                onCreate={comment => createReviewComment.mutateAsync(comment)}
              />
            ) : (
              <OverviewPanel repo={repo} pull={pull} />
            )}
          </Paper>
        </Box>
      </Box>
    </Content>
  );
}
