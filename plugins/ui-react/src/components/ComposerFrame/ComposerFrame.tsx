import { MouseEvent, ReactNode, useRef } from 'react';
import { Box } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import { useAutosizeTextarea } from './useAutosizeTextarea';

// The controls keep bui's field radius rather than a strictly concentric one
// (the frame's minus its padding): at 32px, 4px corners read as square.
// Text and the leading control share one left edge: the frame's padding plus
// `--bui-space-1` of inset each.
const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-2)',
    padding: 'var(--bui-space-2)',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 'var(--bui-radius-4)',
    cursor: 'text',
    transition: 'border-color 0.2s ease-in-out',
    // Only the text field lights up the frame: a focused picker or button draws
    // its own ring, and a second one around the whole box would compete with it.
    '&:has(textarea[data-focused])': {
      borderColor: 'var(--bui-ring)',
    },

    // The frame is the field's visible box, so the textarea's own goes.
    '& .bui-TextArea': {
      boxSizing: 'border-box',
      padding: 'var(--bui-space-1)',
      borderRadius: 0,
      backgroundColor: 'transparent',
      boxShadow: 'none',
      resize: 'none',
      '&[data-focused]': {
        boxShadow: 'none',
      },
    },

    // A picker in the controls row reads as part of the box rather than a field
    // of its own: it takes the fill it would have as a field only when hovered.
    '& .bui-SelectTrigger': {
      paddingInlineStart: 'var(--bui-space-1)',
      backgroundColor: 'transparent',
      // Bare text (the placeholder, or a picker without an icon) needs more
      // room from the edge than an avatar does.
      '&:has(> .bui-SelectValue:first-child)': {
        paddingInlineStart: 'var(--bui-space-2)',
      },
      '&[data-on-bg="neutral-1"]:hover': {
        backgroundColor: 'var(--bui-bg-neutral-2)',
      },
      '&[data-on-bg="neutral-2"]:hover': {
        backgroundColor: 'var(--bui-bg-neutral-3)',
      },
      '&[data-on-bg="neutral-3"]:hover': {
        backgroundColor: 'var(--bui-bg-neutral-4)',
      },
      '&[disabled]:hover': {
        backgroundColor: 'transparent',
      },
    },

    '& .bui-ButtonIcon': {
      borderRadius: 'var(--bui-radius-3)',
    },
  },
  disabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--bui-space-2)',
  },
  leading: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  },
  trailing: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-1)',
    flexShrink: 0,
    marginInlineStart: 'auto',
  },
});

export interface ComposerFrameProps {
  /** The text field — a bui `TextAreaField`, whose own chrome the frame removes. */
  input: ReactNode;
  /** Bottom-left of the box, e.g. a picker for where the message goes. */
  leading?: ReactNode;
  /** Bottom-right of the box: the submit button, or what replaces it. */
  trailing?: ReactNode;
  /** Lines the text field shows when empty. */
  minRows?: number;
  /** Lines the text field grows to before it scrolls. */
  maxRows?: number;
  isDisabled?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * The box of a chat-style composer: a text field that grows with its content,
 * with a row of controls inside the same border underneath it.
 *
 * Presentation only — the caller owns the value, the submit and the controls.
 */
export function ComposerFrame({
  input,
  leading,
  trailing,
  minRows = 2,
  maxRows = 12,
  isDisabled = false,
  className,
  'data-testid': testId,
}: ComposerFrameProps) {
  const classes = useStyles();
  const ref = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  useAutosizeTextarea(ref, { minRows, maxRows });

  // A press on the frame's own padding goes to the text field, as it would in
  // any chat box; presses on the controls are theirs.
  const focusInput = (event: MouseEvent) => {
    if (
      event.target !== event.currentTarget &&
      event.target !== controlsRef.current
    ) {
      return;
    }
    event.preventDefault();
    ref.current?.querySelector('textarea')?.focus();
  };

  return (
    // Pointer convenience only; keyboard users reach the field by Tab.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <Box
      ref={ref}
      bg="neutral"
      className={classNames(
        classes.root,
        isDisabled && classes.disabled,
        className,
      )}
      onMouseDown={focusInput}
      data-testid={testId}
    >
      {input}
      <div ref={controlsRef} className={classes.controls}>
        {leading && <div className={classes.leading}>{leading}</div>}
        <div className={classes.trailing}>{trailing}</div>
      </div>
    </Box>
  );
}
