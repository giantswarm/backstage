import { useParams } from 'react-router-dom';
import {
  Box,
  Chip,
  Divider,
  Paper,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import {
  Content,
  EmptyState,
  Link,
  MarkdownContent,
  Progress,
} from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { roadmapApiRef } from '../../apis';
import { useSchema, useUpdateItemField } from '../../hooks';
import { issueRefOf } from '../../lib/board';
import { formatDate } from '../../lib/dates';
import { rootRouteRef } from '../../routes';
import { FieldEditor } from './FieldEditor';
import { SubIssuesPanel } from './SubIssuesPanel';

const SIDEBAR_WIDTH = 300;
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
  main: {
    flexGrow: 1,
    maxWidth: READING_WIDTH,
    minWidth: 0,
  },
  panel: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    position: 'sticky',
    top: theme.spacing(2),
    padding: theme.spacing(2),
  },
  sidebarTitle: {
    marginBottom: theme.spacing(1),
  },
  sidebarDivider: {
    margin: theme.spacing(2, 0),
  },
  sectionTitle: {
    marginBottom: theme.spacing(1.5),
  },
  comment: {
    marginBottom: theme.spacing(2),
  },
  commentMeta: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
  },
  labelChip: {
    marginRight: theme.spacing(0.5),
  },
}));

/**
 * Epic/item detail: issue body and comments in the reading column; board
 * fields (editable inline) and the sub-issue tree in the sidebar. Field
 * updates and sub-issue linking are writes attributed to the caller via
 * their GitHub token.
 */
export function ItemDetailPage() {
  const classes = useStyles();
  const roadmapApi = useApi(roadmapApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const { id } = useParams();

  const schema = useSchema();
  const updateField = useUpdateItemField();

  const { data, isLoading, error } = useQuery({
    queryKey: ['roadmap', 'item', id],
    queryFn: () => roadmapApi.getItem(id!),
    enabled: !!id,
  });

  const boardPath = rootLink ? rootLink() : '..';

  if (isLoading || schema.isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }
  const loadError = error ?? schema.error;
  if (loadError) {
    return (
      <Content>
        <Alert severity="error">{(loadError as Error).message}</Alert>
      </Content>
    );
  }

  const item = data?.item;
  if (!id || !item) {
    return (
      <Content>
        <EmptyState
          missing="content"
          title="Board item not found"
          description="This roadmap item does not exist or was removed from the board."
          action={<Link to={boardPath}>Back to the board</Link>}
        />
      </Content>
    );
  }

  const fieldValues = new Map(
    item.fields.map(field => [field.name, field.value]),
  );
  const schemaFields = schema.data?.fields ?? [];
  // Title is a text field on every Projects board but is edited on the
  // issue itself, not here.
  const sidebarFields = schemaFields.filter(field => field.name !== 'Title');

  const repository = item.repository?.nameWithOwner;
  const issueRef = issueRefOf({ repo: repository, number: item.number });

  const updated = formatDate(item.updatedAt);

  return (
    <Content>
      <Box className={classes.header}>
        <Link className={classes.backLink} to={boardPath}>
          <ArrowBackIcon fontSize="inherit" /> Roadmap board
        </Link>
        <Typography variant="h4">{item.title}</Typography>
        <Box className={classes.headerMeta}>
          {fieldValues.get('Status') && (
            <Chip size="small" label={fieldValues.get('Status')} />
          )}
          {fieldValues.get('Kind') && (
            <Chip
              size="small"
              variant="outlined"
              label={fieldValues.get('Kind')}
            />
          )}
          <Typography variant="body2" color="textSecondary">
            {repository && item.url ? (
              <Link to={item.url}>
                {repository}#{item.number}
              </Link>
            ) : (
              'draft item'
            )}
            {item.author && ` by ${item.author}`}
            {item.assignees.length > 0 &&
              ` · assigned to ${item.assignees
                .map(login => `@${login}`)
                .join(', ')}`}
            {updated && ` · updated ${updated}`}
          </Typography>
        </Box>
      </Box>

      <Box className={classes.layout}>
        <Box className={classes.main}>
          <Paper className={classes.panel} variant="outlined">
            {item.body ? (
              <MarkdownContent content={item.body} dialect="gfm" />
            ) : (
              <Typography variant="body2" color="textSecondary">
                This item has no description.
              </Typography>
            )}
          </Paper>

          {item.comments.length > 0 && (
            <Paper className={classes.panel} variant="outlined">
              <Typography className={classes.sectionTitle} variant="h6">
                Comments
              </Typography>
              {item.comments.map((comment, index) => (
                <Box key={index} className={classes.comment}>
                  <Typography className={classes.commentMeta}>
                    {comment.author}
                    {formatDate(comment.createdAt, { time: true }) &&
                      ` · ${formatDate(comment.createdAt, { time: true })}`}
                  </Typography>
                  <MarkdownContent content={comment.body} dialect="gfm" />
                </Box>
              ))}
            </Paper>
          )}
        </Box>

        <Paper className={classes.sidebar} variant="outlined">
          <Typography className={classes.sidebarTitle} variant="subtitle1">
            Board fields
          </Typography>
          {updateField.error ? (
            <Alert severity="error" onClose={() => updateField.reset()}>
              {(updateField.error as Error).message}
            </Alert>
          ) : null}
          {sidebarFields.map(field => (
            <FieldEditor
              key={field.name}
              field={field}
              value={fieldValues.get(field.name)}
              disabled={updateField.isPending}
              onChange={value =>
                updateField.mutate({ itemId: id, name: field.name, value })
              }
            />
          ))}
          {item.labels.length > 0 && (
            <>
              <Divider className={classes.sidebarDivider} />
              <Typography className={classes.sidebarTitle} variant="subtitle1">
                Labels
              </Typography>
              <Box>
                {item.labels.map(label => (
                  <Chip
                    key={label}
                    className={classes.labelChip}
                    size="small"
                    variant="outlined"
                    label={label}
                  />
                ))}
              </Box>
            </>
          )}
          <Divider className={classes.sidebarDivider} />
          <Typography className={classes.sidebarTitle} variant="subtitle1">
            Sub-issues
          </Typography>
          {issueRef ? (
            <SubIssuesPanel
              owner={issueRef.owner}
              repo={issueRef.repo}
              issueNumber={issueRef.number}
            />
          ) : (
            <Typography variant="body2" color="textSecondary">
              Draft items have no sub-issues.
            </Typography>
          )}
        </Paper>
      </Box>
    </Content>
  );
}
