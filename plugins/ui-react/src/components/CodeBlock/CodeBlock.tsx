import { makeStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import { CopyButton } from '../CopyButton';

const useStyles = makeStyles(theme => ({
  root: {
    position: 'relative',
    width: '100%',
  },
  codeBlock: {
    margin: 0,
    padding: theme.spacing(1),
    backgroundColor: theme.palette.type === 'dark' ? '#444' : '#f5f5f5',
    color: theme.palette.type === 'dark' ? '#ddd' : '#333',
    borderRadius: 4,
    fontFamily: '"Roboto Mono", monospace',
    fontSize: '0.85em',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  // Extra right padding so long single-line content doesn't run under the copy
  // button — only needed when the button is actually rendered.
  withCopyButton: {
    paddingRight: theme.spacing(5),
  },
  // A capped block scrolls inside itself, so a long log does not stretch the
  // page; lines still wrap, so it never scrolls sideways.
  scrolling: {
    overflowY: 'auto',
  },
  copyButton: {
    position: 'absolute',
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
  },
}));

export type CodeBlockProps = {
  text: string;
  /** Kept for API compatibility; no syntax highlighting is applied today. */
  language?: string;
  copyEnabled?: boolean;
  transparent?: boolean;
  /**
   * Caps the block's height (any CSS length, such as `'400px'`); longer text
   * scrolls inside it. Without it the block grows with its text.
   */
  maxHeight?: string;
};

export const CodeBlock = ({
  text,
  copyEnabled = true,
  transparent = false,
  maxHeight,
}: CodeBlockProps) => {
  const classes = useStyles();

  return (
    <div className={classes.root}>
      <pre
        className={classNames(classes.codeBlock, {
          [classes.withCopyButton]: copyEnabled,
          [classes.scrolling]: Boolean(maxHeight),
        })}
        style={{
          backgroundColor: transparent ? 'transparent' : undefined,
          maxHeight,
        }}
        // A scrolling block takes focus, so it scrolls from the keyboard too
        // (WCAG 2.1.1; axe's scrollable-region-focusable).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={maxHeight ? 0 : undefined}
      >
        {text}
      </pre>
      {copyEnabled && (
        <CopyButton text={text} size="compact" className={classes.copyButton} />
      )}
    </div>
  );
};
