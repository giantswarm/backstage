import { makeStyles, useTheme } from '@material-ui/core';
import { toneColor } from '../../lib/sessionStateTone';
import { SessionSwitcherCard } from './SessionSwitcherCard';
import { RailGroup } from './helpers';

const useStyles = makeStyles(theme => ({
  group: {
    '& + &': {
      marginTop: theme.spacing(2.5),
    },
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    margin: theme.spacing(0, 0, 1),
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.fontWeightMedium as number,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: theme.palette.text.secondary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
}));

type SessionSwitcherGroupProps = {
  group: RailGroup;
  currentSessionId?: string;
  now: number;
};

/**
 * One status group: `● WAITING (4)` and its cards.
 *
 * The count lives in the visible heading rather than being implied by the dot,
 * so the dot is purely decorative and hidden from assistive technology. The
 * heading carries the status, which is why the cards themselves show no badge —
 * in a 280px column, repeating it on every card would cost the title a line.
 */
export function SessionSwitcherGroup({
  group,
  currentSessionId,
  now,
}: SessionSwitcherGroupProps) {
  const classes = useStyles();
  const theme = useTheme();

  return (
    <section className={classes.group}>
      <h3 className={classes.heading}>
        <span
          aria-hidden="true"
          className={classes.dot}
          style={{ backgroundColor: toneColor(group.tone, theme) }}
        />
        <span>{group.label}</span>
        <span>({group.sessions.length})</span>
      </h3>
      <ul className={classes.list}>
        {group.sessions.map(session => (
          <SessionSwitcherCard
            key={session.row.id}
            session={session}
            isCurrent={session.row.sessionId === currentSessionId}
            now={now}
          />
        ))}
      </ul>
    </section>
  );
}
