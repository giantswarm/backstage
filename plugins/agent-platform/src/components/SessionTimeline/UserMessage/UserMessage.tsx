import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

import {
  CollapsibleToggle,
  CollapsibleViewport,
  useCollapsible,
} from '@giantswarm/backstage-plugin-ui-react';

/**
 * How much of a user message shows before *Show more*, in lines of its own
 * text: a continuation's opener carries the whole earlier conversation, and a
 * pasted log or file runs to thousands of lines, either of which buries the
 * answer under it.
 */
export const USER_MESSAGE_LINES = 10;

const useStyles = makeStyles(theme => ({
  // The user's message is a bubble on the right, the agent's prose plain on the
  // left — the alignment carries who speaks, the way every chat surface does.
  userRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: theme.spacing(0.5),
  },
  userBubble: {
    maxWidth: '85%',
    // The fill Send carries (a bui primary button), and its foreground: one
    // pair, so the text and the Show more on it read in light and dark. The
    // shell's `--bui-bg-solid` is its primary colour (`agentShellLightColors`),
    // and Backstage's own themes match it to the MUI primary in both modes.
    // The solid tokens are deprecated for `--bui-accent-*`, but the installed
    // bui's primary Button still paints these, and the shell's accent is the
    // bright #009fff, under which white text fails contrast.
    // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- see above
    backgroundColor: 'var(--bui-bg-solid)',
    // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- see above
    color: 'var(--bui-fg-solid)',
    padding: theme.spacing(1.25, 2),
    borderRadius: 'var(--bui-radius-3)',
    // On the bubble rather than the text, so the cut's `lh` is a line of it.
    fontSize: '0.875rem',
    lineHeight: 1.6,
    // What a long message's fade fades to: the bubble, not the page.
    // eslint-disable-next-line @backstage/no-deprecated-bui-tokens -- see above
    '--bui-bg-inherit': 'var(--bui-bg-solid)',
  },
  // In the bubble, under the cut and its fade, or at the end of the opened
  // text: a row of its own, so the button never covers a line.
  toggleRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: theme.spacing(0.5),
  },
  // Deliberately not markdown: prompts quote logs, manifests and `#` headings
  // that must stay the characters the user typed.
  userText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    font: 'inherit',
  },
  // The bubble says "you" visually; this keeps saying it to assistive tech.
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
}));

export type UserMessageProps = {
  text: string;
  /**
   * A line under the bubble saying who wrote it when it was not the person —
   * the portal's prepared opener of a hand-off session.
   */
  caption?: string;
  /**
   * Whether a long message is shown whole, held by the timeline so it
   * outlives the row: the optimistic copy of a sent message gives way to
   * kagent's under another key, and the turn window unmounts old turns.
   * The bubble keeps its own state when absent.
   */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

/**
 * The person's message as a right-aligned bubble. A long one is cut to
 * {@link USER_MESSAGE_LINES} lines of its text behind a fade, with *Show
 * more* centred in the bubble under the fade, and *Show less* in the same
 * place at the end of the opened text, in the bubble's own foreground.
 */
export function UserMessage({
  text,
  caption,
  expanded,
  onExpandedChange,
}: UserMessageProps) {
  const classes = useStyles();
  const collapsible = useCollapsible({
    collapsedHeight: `${USER_MESSAGE_LINES}lh`,
    expanded,
    onExpandedChange,
  });

  return (
    <div className={classes.userRow} data-testid="timeline-user-message">
      <div className={classes.userBubble} data-testid="user-message-bubble">
        <span className={classes.srOnly}>You</span>
        <CollapsibleViewport state={collapsible}>
          <pre className={classes.userText}>{text}</pre>
        </CollapsibleViewport>
        {collapsible.overflows && (
          <div className={classes.toggleRow}>
            <CollapsibleToggle
              state={collapsible}
              labels={{ expand: 'Show more', collapse: 'Show less' }}
              onSolid
            />
          </div>
        )}
      </div>
      {caption && (
        <Text
          as="p"
          variant="body-x-small"
          color="secondary"
          data-testid="timeline-user-message-caption"
        >
          {caption}
        </Text>
      )}
    </div>
  );
}
