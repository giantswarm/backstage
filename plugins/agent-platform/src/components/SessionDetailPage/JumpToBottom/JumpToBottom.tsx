import { Button, VisuallyHidden } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';
import { DOCK_HEIGHT_VAR } from '../useDockedComposerLayout';
import { END_CHROME_ATTRIBUTE } from '../useJumpToBottom';

// The knobs. Everything a design iteration is likely to touch is here.

/** The button's text. */
export const JUMP_TO_BOTTOM_LABEL = 'Jump to bottom';

/** What a screen reader hears, politely, when the button appears. */
export const NEW_CONTENT_ANNOUNCEMENT =
  'New content below. Jump to bottom shows it.';

/** bui's variant: `primary` is the shell's solid primary colour. */
const VARIANT = 'primary';

/** bui's size; the styles below make it larger still. */
const SIZE = 'medium';

/** The button's height and text size, larger than bui's medium. */
const HEIGHT = 44;
const FONT_SIZE = 'var(--bui-font-size-4)';
const PADDING_INLINE = 'var(--bui-space-5)';

/** How far above the composer's top edge the button floats. */
const GAP_ABOVE_COMPOSER = 'var(--bui-space-3)';

/** Where on the line it sits: `center`, `flex-start` or `flex-end`. */
const ALIGN = 'center';

/** How long it takes to fade in (ms); none under reduced motion. */
const FADE_IN_MS = 150;

/** The column's gap (`Flex gap="4"`), which the zero-height anchor gives back. */
const COLUMN_GAP = 'var(--bui-space-4)';

const useStyles = makeStyles({
  // A zero-height strip right above the docked composer, sticky like it: the
  // button floats over the conversation's bottom edge without taking room in
  // the flow, so showing it never moves the content or resizes the dock.
  anchor: {
    position: 'sticky',
    bottom: `calc(var(${DOCK_HEIGHT_VAR}, 0px) + var(--agent-shell-mobile-bar-height, 0px))`,
    zIndex: 2,
    height: 0,
    marginTop: `calc(-1 * ${COLUMN_GAP})`,
    display: 'flex',
    justifyContent: ALIGN,
    // Never the browser's scroll anchor: it moves with the view.
    overflowAnchor: 'none',
  },
  button: {
    position: 'absolute',
    bottom: GAP_ABOVE_COMPOSER,
    minHeight: HEIGHT,
    paddingInline: PADDING_INLINE,
    fontSize: FONT_SIZE,
    animation: `$fadeIn ${FADE_IN_MS}ms ease-out`,
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  },
  '@keyframes fadeIn': {
    from: { opacity: 0, transform: 'translateY(4px)' },
  },
});

/**
 * The session page's way down to content that arrived below the visible part
 * of the conversation (see `useJumpToBottom`): a large button in the shell's
 * primary colour, floating just above the docked composer.
 *
 * Rendered as the column's child right before the dock, so it is the tab stop
 * before the composer. It is there only while there is something new below,
 * and a polite live region says so when it appears. Pressed from the
 * keyboard, the focus moves on to the composer's box, as the button goes away
 * under it.
 */
export function JumpToBottom({
  isShown,
  onJump,
  dock,
}: {
  isShown: boolean;
  onJump: () => void;
  /** The docked composer, whose box takes the focus after a key press. */
  dock: HTMLElement | null;
}) {
  const classes = useStyles();
  const chrome = { [END_CHROME_ATTRIBUTE]: '' };
  return (
    <div className={classes.anchor} data-testid="jump-to-bottom" {...chrome}>
      <VisuallyHidden aria-live="polite">
        {isShown ? NEW_CONTENT_ANNOUNCEMENT : ''}
      </VisuallyHidden>
      {isShown && (
        <Button
          variant={VARIANT}
          size={SIZE}
          className={classes.button}
          iconStart={<ArrowDownwardIcon fontSize="small" />}
          onPress={event => {
            onJump();
            if (
              event.pointerType === 'keyboard' ||
              event.pointerType === 'virtual'
            ) {
              dock
                ?.querySelector<HTMLElement>('textarea:not(:disabled)')
                ?.focus({ preventScroll: true });
            }
          }}
        >
          {JUMP_TO_BOTTOM_LABEL}
        </Button>
      )}
    </div>
  );
}
