import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import CheckIcon from '@material-ui/icons/Check';
import { ButtonIcon, Tooltip, TooltipTrigger } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import { useCopyWithFeedback } from '../../hooks/useCopyWithFeedback';

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
  const { copied, copy } = useCopyWithFeedback();
  const handleCopy = () => copy(text);

  return (
    <TooltipTrigger>
      <ButtonIcon
        className={classNames(
          { [classes.compact]: size === 'compact' },
          className,
        )}
        variant="tertiary"
        size="small"
        aria-label={copied ? 'Copied' : label}
        icon={copied ? <CheckIcon /> : <FileCopyOutlinedIcon />}
        onPress={handleCopy}
      />
      <Tooltip>{copied ? 'Copied' : label}</Tooltip>
    </TooltipTrigger>
  );
};
