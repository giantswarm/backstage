import { makeStyles } from '@material-ui/core/styles';
import { SHELL_CONTENT_ID } from '../../ShellMain';

const useStyles = makeStyles({
  // Visually hidden until focused: clipped to nothing and out of hit testing,
  // so it never covers content, wherever the rail sits (the mobile bar is
  // anchored to the bottom, where a translate-off-the-top trick moved it INTO
  // view). Focused, it shows at the top left of the viewport, above the rail.
  root: {
    position: 'fixed',
    left: 'var(--bui-space-2)',
    top: 'var(--bui-space-2)',
    zIndex: 1001,
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    borderRadius: 'var(--bui-radius-2)',
    background: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-fg-primary)',
    border: 0,
    '&:focus': {
      width: 'auto',
      height: 'auto',
      margin: 0,
      padding: 'var(--bui-space-2) var(--bui-space-3)',
      overflow: 'visible',
      clip: 'auto',
      clipPath: 'none',
      pointerEvents: 'auto',
      border: '1px solid var(--bui-border-2)',
      outline: '2px solid var(--bui-ring)',
      outlineOffset: 2,
    },
  },
});

/** Hidden until focused: the first tab stop of the shell, to the page content. */
export function SkipLink() {
  const classes = useStyles();
  return (
    <a
      href={`#${SHELL_CONTENT_ID}`}
      className={classes.root}
      onClick={event => {
        const content = document.getElementById(SHELL_CONTENT_ID);
        if (content) {
          event.preventDefault();
          content.focus();
        }
      }}
    >
      Skip to content
    </a>
  );
}
