import { CodeSnippet, CopyTextButton } from '@backstage/core-components';
import { Box, makeStyles } from '@material-ui/core';
import React from 'react';

const useStyles = makeStyles(theme => ({
  flexContainer: {
    display: 'flex',
    width: '100%',

    '& pre': {
      margin: 0,
    },
  },
  codeSnippetContainer: {
    position: 'relative',
    flex: 1,
    minHeight: '56px',
    paddingTop: '6px',
  },
  copyButtonContainer: {
    width: '48px',
    marginLeft: theme.spacing(1),
  },
  codeSnippetWrapper: {
    position: 'absolute',
    width: '100%',
  },
}));

type CodeBlockProps = {
  text: string;
  language: string;
};

export const CodeBlock = ({ text, language }: CodeBlockProps) => {
  const classes = useStyles();

  return (
    <Box className={classes.flexContainer}>
      <Box className={classes.codeSnippetContainer}>
        <Box className={classes.codeSnippetWrapper}>
          <CodeSnippet text={text} language={language} />
        </Box>
      </Box>
      <Box className={classes.copyButtonContainer}>
        <CopyTextButton text={text} />
      </Box>
    </Box>
  );
};
