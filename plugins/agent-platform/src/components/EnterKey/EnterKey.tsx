import { makeStyles } from '@material-ui/core/styles';
import KeyboardReturnIcon from '@material-ui/icons/KeyboardReturn';
import { Kbd } from '../Kbd';

const useStyles = makeStyles({
  // A span rather than bui's VisuallyHidden, which is a <div>: a key cap sits
  // in running text, where only phrasing content may go.
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

/** Enter as a key cap: the Return icon, named "Enter" for screen readers. */
export function EnterKey() {
  const classes = useStyles();
  return (
    <Kbd>
      <KeyboardReturnIcon />
      <span className={classes.srOnly}>Enter</span>
    </Kbd>
  );
}
