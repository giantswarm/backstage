import { makeStyles } from '@material-ui/core/styles';
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
};

export const CodeBlock = ({
  text,
  copyEnabled = true,
  transparent = false,
}: CodeBlockProps) => {
  const classes = useStyles();

  return (
    <div className={classes.root}>
      <pre
        className={
          copyEnabled
            ? `${classes.codeBlock} ${classes.withCopyButton}`
            : classes.codeBlock
        }
        style={transparent ? { backgroundColor: 'transparent' } : undefined}
      >
        {text}
      </pre>
      {copyEnabled && (
        <CopyButton text={text} size="compact" className={classes.copyButton} />
      )}
    </div>
  );
};
