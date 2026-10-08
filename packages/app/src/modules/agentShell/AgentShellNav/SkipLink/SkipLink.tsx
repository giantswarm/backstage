import { makeStyles } from '@material-ui/core/styles';
import { SHELL_CONTENT_ID } from '../../ShellMain';

const useStyles = makeStyles({
  root: {
    position: 'absolute',
    left: 'var(--bui-space-2)',
    top: 'var(--bui-space-2)',
    zIndex: 1,
    padding: 'var(--bui-space-2) var(--bui-space-3)',
    borderRadius: 'var(--bui-radius-2)',
    background: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-fg-primary)',
    border: '1px solid var(--bui-border-2)',
    transform: 'translateY(-200%)',
    '&:focus': {
      transform: 'none',
      outline: '2px solid var(--bui-ring)',
      outlineOffset: 2,
    },
  },
});

/** Hidden until focused: the first stop of the rail, to the page content. */
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
