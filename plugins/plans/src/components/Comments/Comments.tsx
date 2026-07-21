import { FormEvent, useState } from 'react';
import { Alert, Button, Flex, Text, TextAreaField } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { GSMarkdownContent } from '@giantswarm/backstage-plugin-ui-react';
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
  form: {
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
    <div className={classes.comment}>
      <Text variant="body-small" color="secondary">
        {comment.author ?? 'unknown'}
        {created && ` · ${created}`}
      </Text>
      <GSMarkdownContent content={comment.body} />
    </div>
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

  const label = placeholder ?? 'Leave a comment (markdown supported)';

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
      <Flex direction="column" gap="2">
        <TextAreaField
          aria-label={label}
          placeholder={label}
          rows={2}
          value={body}
          onChange={setBody}
          isDisabled={pending}
        />
        {error && (
          <Alert status="danger" title="Comment failed" description={error} />
        )}
        <Flex gap="2">
          <Button
            type="submit"
            variant="primary"
            size="small"
            isDisabled={pending || body.trim() === ''}
          >
            Comment
          </Button>
          {onCancel && (
            <Button
              variant="tertiary"
              size="small"
              onClick={onCancel}
              isDisabled={pending}
            >
              Cancel
            </Button>
          )}
        </Flex>
      </Flex>
    </form>
  );
}
