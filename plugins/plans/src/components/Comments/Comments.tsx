import { FormEvent, useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { MarkdownContent } from '@backstage/core-components';
import { NewReviewComment, PlanComment } from '../../apis';
import { ReviewThread } from '../../lib/annotations';
import { formatDate } from '../../lib/dates';

const useStyles = makeStyles((theme: Theme) => ({
  comment: {
    padding: theme.spacing(1, 0),
    '& + &': {
      borderTop: `1px solid ${theme.palette.divider}`,
    },
  },
  meta: {
    color: theme.palette.text.secondary,
    fontSize: 12,
  },
  form: {
    marginTop: theme.spacing(1),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
}));

/**
 * One comment: author and timestamp, then the markdown body. Comments
 * written through the portal already carry the Backstage user in the body
 * (the backend prefixes it), so the GitHub author is shown as-is.
 */
export function CommentItem({ comment }: { comment: PlanComment }) {
  const classes = useStyles();
  const created = formatDate(comment.createdAt, { time: true });

  return (
    <Box className={classes.comment}>
      <Typography className={classes.meta}>
        {comment.author ?? 'unknown'}
        {created && ` · ${created}`}
      </Typography>
      <MarkdownContent content={comment.body} dialect="gfm" />
    </Box>
  );
}

/**
 * One review thread: the root comment, its replies, and a reply form.
 * Shared by the rendered (AnnotatedMarkdown) and diff (DiffView) views.
 */
export function CommentThread(props: {
  thread: ReviewThread;
  onCreate: (comment: NewReviewComment) => Promise<unknown>;
}) {
  const { thread, onCreate } = props;
  return (
    <>
      <CommentItem comment={thread.root} />
      {thread.replies.map(reply => (
        <CommentItem key={reply.id} comment={reply} />
      ))}
      <CommentForm
        placeholder="Reply"
        onSubmit={body => onCreate({ body, inReplyTo: thread.root.id })}
      />
    </>
  );
}

/**
 * Markdown comment form. `onSubmit` performs the mutation; the form clears
 * itself on success and surfaces the error on failure.
 */
export function CommentForm(props: {
  onSubmit: (body: string) => Promise<unknown>;
  placeholder?: string;
  onCancel?: () => void;
}) {
  const { onSubmit, placeholder, onCancel } = props;
  const classes = useStyles();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (body.trim() === '' || pending) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await onSubmit(body);
      setBody('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={classes.form} onSubmit={submit}>
      <TextField
        fullWidth
        multiline
        minRows={2}
        variant="outlined"
        size="small"
        placeholder={placeholder ?? 'Leave a comment (markdown supported)'}
        value={body}
        onChange={event => setBody(event.target.value)}
        disabled={pending}
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Box className={classes.actions}>
        <Button
          type="submit"
          size="small"
          variant="contained"
          color="primary"
          disabled={pending || body.trim() === ''}
        >
          Comment
        </Button>
        {onCancel && (
          <Button size="small" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </Box>
    </form>
  );
}
