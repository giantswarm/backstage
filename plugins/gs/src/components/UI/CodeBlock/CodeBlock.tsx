import { CopyTextButton } from '@backstage/core-components';
import { Box, makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  flexContainer: {
    display: 'flex',
    alignItems: 'flex-start',
    width: '100%',
  },
  codeBlock: {
    flex: 1,
    minWidth: 0,
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
  copyButtonContainer: {
    marginLeft: theme.spacing(1),
    marginTop: '-8px',
    marginRight: '-12px',
    marginBottom: '-12px',
  },
}));

type CodeBlockProps = {
  text: string;
  language: string;
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
    <Box className={classes.flexContainer}>
      <pre
        className={classes.codeBlock}
        style={transparent ? { backgroundColor: 'transparent' } : undefined}
      >
        {text}
      </pre>
      {copyEnabled && (
        <Box className={classes.copyButtonContainer}>
          <CopyTextButton text={text} />
        </Box>
      )}
    </Box>
  );
};
