import { useEffect, useRef, useState } from 'react';
import { Box, makeStyles } from '@material-ui/core';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import CheckIcon from '@material-ui/icons/Check';
import { ButtonIcon, Tooltip, TooltipTrigger } from '@backstage/ui';
import useCopyToClipboard from 'react-use/esm/useCopyToClipboard';

const useStyles = makeStyles(theme => ({
  root: {
    position: 'relative',
    width: '100%',
  },
  codeBlock: {
    margin: 0,
    // Leave room on the right so long single-line content doesn't run under
    // the copy button.
    padding: theme.spacing(1),
    paddingRight: theme.spacing(5),
    backgroundColor: theme.palette.type === 'dark' ? '#444' : '#f5f5f5',
    color: theme.palette.type === 'dark' ? '#ddd' : '#333',
    borderRadius: 4,
    fontFamily: '"Roboto Mono", monospace',
    fontSize: '0.85em',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  copyButton: {
    position: 'absolute',
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
    // bui's small ButtonIcon is 32px square — oversized next to a text-sized
    // icon, and taller than a single-line code block (so its hover background
    // pokes past the bottom edge). Shrink the whole button so it sits tidily
    // inside the block; `!important` overrides bui's own height/width rules.
    width: '1.5rem !important',
    height: '1.5rem !important',
    minWidth: 'unset',
    minHeight: 'unset',
    // Shrink the icon itself to roughly body-text size.
    '& svg': {
      width: '1rem',
      height: '1rem',
      fontSize: '1rem',
    },
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
  const [copied, setCopied] = useState(false);
  const [{ error }, copyToClipboard] = useCopyToClipboard();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    copyToClipboard(text);
    setCopied(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const showCopied = copied && !error;

  return (
    <Box className={classes.root}>
      <pre
        className={classes.codeBlock}
        style={transparent ? { backgroundColor: 'transparent' } : undefined}
      >
        {text}
      </pre>
      {copyEnabled && (
        <TooltipTrigger>
          <ButtonIcon
            className={classes.copyButton}
            variant="tertiary"
            size="small"
            aria-label={showCopied ? 'Copied' : 'Copy'}
            icon={showCopied ? <CheckIcon /> : <FileCopyOutlinedIcon />}
            onPress={handleCopy}
          />
          <Tooltip>{showCopied ? 'Copied' : 'Copy'}</Tooltip>
        </TooltipTrigger>
      )}
    </Box>
  );
};
