import { useEffect, useRef, useState } from 'react';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import CheckIcon from '@material-ui/icons/Check';
import { ButtonIcon, Tooltip, TooltipTrigger } from '@backstage/ui';
import { errorApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import useCopyToClipboard from 'react-use/esm/useCopyToClipboard';

const useStyles = makeStyles({
  // bui's small ButtonIcon is 32px square, oversized next to text-sized content
  // such as a card title or a code line. `!important` overrides bui's own
  // height/width rules.
  compact: {
    width: '1.5rem !important',
    height: '1.5rem !important',
    '& svg': {
      width: '1rem',
      height: '1rem',
      fontSize: '1rem',
    },
  },
});

export type CopyButtonProps = {
  /** The text put on the clipboard. */
  text: string;
  /** Accessible name and tooltip before copying. */
  label?: string;
  /**
   * `compact` (24px) sits next to text-sized content: a card header, a code
   * block. `small` is bui's small ButtonIcon (32px).
   */
  size?: 'small' | 'compact';
  className?: string;
};

/**
 * Icon button that copies `text` to the clipboard and confirms with "Copied"
 * for a moment.
 */
export const CopyButton = ({
  text,
  label = 'Copy',
  size = 'small',
  className,
}: CopyButtonProps) => {
  const classes = useStyles();
  const errorApi = useApi(errorApiRef);
  const [copied, setCopied] = useState(false);
  const [{ error }, copyToClipboard] = useCopyToClipboard();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Surface a copy failure the same way Backstage's CopyTextButton does, rather
  // than silently reverting to the label.
  useEffect(() => {
    if (error) {
      errorApi.post(error);
    }
  }, [error, errorApi]);

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
    <TooltipTrigger>
      <ButtonIcon
        className={classNames(
          { [classes.compact]: size === 'compact' },
          className,
        )}
        variant="tertiary"
        size="small"
        aria-label={showCopied ? 'Copied' : label}
        icon={showCopied ? <CheckIcon /> : <FileCopyOutlinedIcon />}
        onPress={handleCopy}
      />
      <Tooltip>{showCopied ? 'Copied' : label}</Tooltip>
    </TooltipTrigger>
  );
};
