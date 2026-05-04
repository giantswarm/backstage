import { memo } from 'react';
import { useMessagePartText } from '@assistant-ui/react';
import { makeStyles, createStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(() =>
  createStyles({
    root: {
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
  }),
);

const UserMessageTextImpl = () => {
  const classes = useStyles();
  const { text } = useMessagePartText();
  return <span className={classes.root}>{text}</span>;
};

export const UserMessageText = memo(UserMessageTextImpl);
