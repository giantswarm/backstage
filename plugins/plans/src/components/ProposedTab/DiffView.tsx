import { Fragment, useMemo, useState } from 'react';
import {
  Box,
  IconButton,
  makeStyles,
  Theme,
} from '@material-ui/core';
import AddCommentIcon from '@material-ui/icons/AddComment';
import { NewReviewComment, PlanReviewComment } from '../../apis';
import { DiffLine, parsePatch } from '../../lib/diff';
import { CommentForm, CommentItem } from '../Comments';

const useStyles = makeStyles((theme: Theme) => ({
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 1.6,
    border: `1px solid ${theme.palette.divider}`,
  },
  lineNumber: {
    width: 36,
    minWidth: 36,
    padding: theme.spacing(0, 0.5),
    textAlign: 'right',
    verticalAlign: 'top',
    color: theme.palette.text.secondary,
    userSelect: 'none',
  },
  gutter: {
    width: 28,
    minWidth: 28,
    padding: 0,
    verticalAlign: 'top',
    userSelect: 'none',
  },
  gutterButton: {
    padding: 2,
    // Revealed on row hover; always present so keyboard focus reaches it.
    opacity: 0,
    '&:focus-visible': {
      opacity: 1,
    },
  },
  text: {
    padding: theme.spacing(0, 1),
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    verticalAlign: 'top',
    width: '100%',
  },
  row: {
    '&:hover $gutterButton': {
      opacity: 1,
    },
  },
  hunk: {
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.secondary,
  },
  add: {
    backgroundColor: 'rgba(46, 160, 67, 0.15)',
  },
  del: {
    backgroundColor: 'rgba(248, 81, 73, 0.15)',
  },
  threadCell: {
    padding: theme.spacing(0, 2),
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
    fontFamily: theme.typography.fontFamily,
  },
  thread: {
    maxWidth: 720,
    padding: theme.spacing(1, 0),
  },
}));

interface Thread {
  root: PlanReviewComment;
  replies: PlanReviewComment[];
}

/** Group inline comments into threads keyed by new-file line number. */
function threadsByLine(
  comments: PlanReviewComment[],
): Map<number, Thread[]> {
  const roots = new Map<number, Thread>();
  for (const comment of comments) {
    if (comment.inReplyTo === undefined) {
      roots.set(comment.id, { root: comment, replies: [] });
    }
  }
  for (const comment of comments) {
    if (comment.inReplyTo !== undefined) {
      roots.get(comment.inReplyTo)?.replies.push(comment);
    }
  }
  const byLine = new Map<number, Thread[]>();
  for (const thread of roots.values()) {
    // ponytail: LEFT-side (deleted-line) threads are grouped by the same
    // line number; a dedicated LEFT anchor would need old/new-side tracking.
    if (thread.root.line === undefined) {
      continue;
    }
    const list = byLine.get(thread.root.line) ?? [];
    list.push(thread);
    byLine.set(thread.root.line, list);
  }
  return byLine;
}

function lineClass(
  classes: ReturnType<typeof useStyles>,
  type: DiffLine['type'],
): string | undefined {
  if (type === 'add') return classes.add;
  if (type === 'del') return classes.del;
  if (type === 'hunk') return classes.hunk;
  return undefined;
}

/**
 * Unified diff with GitHub-style inline commenting: existing review-comment
 * threads render under their anchor line, and every line that exists on the
 * new side takes new threads via the gutter button.
 */
export function DiffView(props: {
  patch: string;
  path: string;
  comments: PlanReviewComment[];
  onCreate: (comment: NewReviewComment) => Promise<unknown>;
}) {
  const { patch, path, comments, onCreate } = props;
  const classes = useStyles();
  const [commentingLine, setCommentingLine] = useState<number | undefined>(
    undefined,
  );

  const lines = useMemo(() => parsePatch(patch), [patch]);
  const threads = useMemo(() => threadsByLine(comments), [comments]);

  const marker = (type: DiffLine['type']) => {
    if (type === 'add') return '+';
    if (type === 'del') return '−';
    return ' ';
  };

  return (
    <table className={classes.table}>
      <tbody>
        {lines.map((line, index) => {
          if (line.type === 'hunk') {
            return (
              <tr key={index} className={classes.hunk}>
                <td className={classes.lineNumber} colSpan={2} />
                <td className={classes.gutter} />
                <td className={classes.text}>{line.text}</td>
              </tr>
            );
          }

          const lineThreads =
            line.newLine !== undefined ? threads.get(line.newLine) ?? [] : [];
          const commentable = line.newLine !== undefined;
          const commenting =
            commentable && commentingLine === line.newLine;

          return (
            <Fragment key={index}>
              <tr className={`${classes.row} ${lineClass(classes, line.type) ?? ''}`}>
                <td className={classes.lineNumber}>{line.oldLine ?? ''}</td>
                <td className={classes.lineNumber}>{line.newLine ?? ''}</td>
                <td className={classes.gutter}>
                  {commentable && (
                    <IconButton
                      className={classes.gutterButton}
                      size="small"
                      aria-label={`Comment on line ${line.newLine}`}
                      onClick={() => setCommentingLine(line.newLine)}
                    >
                      <AddCommentIcon fontSize="inherit" />
                    </IconButton>
                  )}
                </td>
                <td className={classes.text}>
                  {marker(line.type)}
                  {line.text}
                </td>
              </tr>
              {(lineThreads.length > 0 || commenting) && (
                <tr>
                  <td className={classes.threadCell} colSpan={4}>
                    {lineThreads.map(thread => (
                      <Box key={thread.root.id} className={classes.thread}>
                        <CommentItem comment={thread.root} />
                        {thread.replies.map(reply => (
                          <CommentItem key={reply.id} comment={reply} />
                        ))}
                        <CommentForm
                          placeholder="Reply"
                          onSubmit={body =>
                            onCreate({ body, inReplyTo: thread.root.id })
                          }
                        />
                      </Box>
                    ))}
                    {commenting && (
                      <Box className={classes.thread}>
                        <CommentForm
                          placeholder={`Comment on line ${line.newLine}`}
                          onSubmit={async body => {
                            await onCreate({
                              body,
                              path,
                              line: line.newLine,
                            });
                            setCommentingLine(undefined);
                          }}
                          onCancel={() => setCommentingLine(undefined)}
                        />
                      </Box>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
