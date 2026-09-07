import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Avatar, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import { formatCompactAge } from '../../lib/duration';
import { sessionDetailRouteRef } from '../../routes';
import { SESSION_TITLE_FALLBACK } from '../SessionsDataProvider/helpers';
import { RailSession } from './helpers';

/** Requested at 2× the ~24px render, matching the list and detail page. */
const AVATAR_SIZE: AvatarSize = 48;

const useStyles = makeStyles(theme => ({
  card: {
    display: 'block',
    padding: theme.spacing(1, 1.5),
    borderRadius: 'var(--bui-radius-3)',
    border: `1px solid ${theme.palette.divider}`,
    textDecoration: 'none',
    color: 'inherit',
    '&:hover': {
      backgroundColor: 'var(--bui-bg-neutral-1-hover)',
      textDecoration: 'none',
    },
    // The current card's accent bar is an *inset shadow*, not a thicker left
    // border. A border would either shift the text of the selected card or, if
    // reserved as transparent on every card, leave every other card with no
    // left edge at all — which is exactly what it did.
    '&[data-current="true"]': {
      backgroundColor: 'var(--bui-bg-neutral-2)',
      boxShadow: `inset 3px 0 0 ${theme.palette.text.primary}`,
    },
  },
  age: {
    display: 'block',
    fontVariantNumeric: 'tabular-nums',
  },
  title: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    margin: theme.spacing(0.25, 0, 0.5),
    fontSize: theme.typography.body2.fontSize,
    fontWeight: theme.typography.fontWeightMedium as number,
    lineHeight: 1.35,
    '$card[data-current="true"] &': {
      fontWeight: theme.typography.fontWeightBold as number,
    },
  },
  agent: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    minWidth: 0,
  },
  agentName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}));

type SessionSwitcherCardProps = {
  session: RailSession;
  isCurrent: boolean;
  /** Epoch ms to age against, supplied by the rail so every card agrees. */
  now: number;
};

/**
 * One session in the rail.
 *
 * A real anchor, not a bui `List` row and not a `Card` with `onPress`. Three
 * reasons, in descending order of how much they matter:
 *
 * - This is **navigation between URLs**, and the accessible expression of that is
 *   `aria-current="page"`. A bui `List` is a react-aria `GridList` whose rows are
 *   `role="row"` with `aria-selected`, which tells a screen-reader user the row is
 *   *selected* — a different claim, and not one this rail can honour.
 * - An anchor is middle-clickable, cmd-clickable and previews its target. bui's
 *   `href` cannot be used here at all: `BUIProvider` is not mounted in this app,
 *   so react-aria's `RouterProvider` is inactive and a bui `href` triggers a full
 *   page reload (the same reason `SessionsTable` links the way it does).
 * - Two groups would need two independent `GridList`s, since bui exposes no
 *   sections — two focus scopes and a split `selectedKeys` for one visual list.
 *
 * The state is carried by `data-current` for styling *and* `aria-current` for
 * meaning, never by colour alone: the current card also gets a left accent bar
 * and a heavier title.
 */
export function SessionSwitcherCard({
  session,
  isCurrent,
  now,
}: SessionSwitcherCardProps) {
  const classes = useStyles();
  const buildAvatarUrl = useAgentAvatarUrl();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const { row } = session;

  const age = formatCompactAge(session.changedAt, now);
  const avatarUrl = row.agentTechnicalName
    ? buildAvatarUrl(row.installation, row.agentTechnicalName, {
        size: AVATAR_SIZE,
      })
    : undefined;

  // Both parameters are needed: kagent session ids are only unique within an
  // installation. Undefined when the route isn't bound, in which case the card
  // renders inert rather than as a link that goes nowhere — the same call
  // `SessionsTable` makes for its rows.
  const href = sessionDetailRoute?.({
    installation: row.installation,
    sessionId: row.sessionId,
  });

  const body = (
    <>
      {age && (
        <Text
          as="span"
          variant="body-small"
          color="secondary"
          className={classes.age}
        >
          {age}
        </Text>
      )}
      <span className={classes.title}>
        {row.title || SESSION_TITLE_FALLBACK}
      </span>
      {row.agentName && (
        <span className={classes.agent}>
          <Avatar
            size="x-small"
            purpose="decoration"
            name={row.agentName}
            src={avatarUrl ?? ''}
          />
          <Text
            as="span"
            variant="body-small"
            color="secondary"
            className={classes.agentName}
          >
            {row.agentName}
          </Text>
        </span>
      )}
    </>
  );

  return (
    <li>
      {href ? (
        <Link
          to={href}
          className={classes.card}
          data-current={isCurrent ? 'true' : undefined}
          aria-current={isCurrent ? 'page' : undefined}
        >
          {body}
        </Link>
      ) : (
        <div
          className={classes.card}
          data-current={isCurrent ? 'true' : undefined}
        >
          {body}
        </div>
      )}
    </li>
  );
}
