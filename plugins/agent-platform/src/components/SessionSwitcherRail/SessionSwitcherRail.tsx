import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { Button, ButtonIcon, Skeleton, Text } from '@backstage/ui';
import { makeStyles, Tooltip, useTheme } from '@material-ui/core';
import {
  ArrowMenuCloseIcon,
  ArrowMenuOpenIcon,
  PLUGIN_CONTENT_VIEWPORT_OFFSET,
} from '@giantswarm/backstage-plugin-ui-react';
import { SessionSwitcherGroup, toneColor } from './SessionSwitcherGroup';
import { useRailCollapsed } from './useRailCollapsed';
import { useSessionSwitcher } from './useSessionSwitcher';

export const RAIL_WIDTH = 280;
export const RAIL_WIDTH_COMPACT = 240;
export const RAIL_WIDTH_COLLAPSED = 48;

/**
 * Gap kept above the rail once it sticks.
 *
 * `maxHeight` deliberately still subtracts the *unstuck* offset (header +
 * `Content` padding): that is the larger of the two, so the rail can never
 * overflow the viewport at the top of the page. The cost is some unused height
 * at the bottom once stuck, which is invisible — the rail scrolls internally.
 */
const STICKY_TOP = 16;

/** The scroller `aria-controls` names — rendered only in the expanded branch. */
const SESSIONS_REGION_ID = 'session-switcher-sessions';

/** Placeholder cards shown while the states resolve. */
const SKELETON_COUNT = 3;

const useStyles = makeStyles(theme => ({
  // Anchored to the viewport, because there is nothing to inherit a height
  // from: the app shell's sidebar is fixed and the content column is
  // content-sized, so a `height: 100%` chain collapses. The offset is the
  // chrome above — see PLUGIN_CONTENT_VIEWPORT_OFFSET.
  //
  // Sticky rather than a split pane on purpose. The conversation stays on the
  // document scroller, which is what the composer's `position: sticky; bottom`
  // dock, `scrollToBottom()` and the streaming auto-follow all measure against.
  // Giving the conversation its own scroll container would break all three.
  root: {
    position: 'sticky',
    // Not 0. Stuck against the viewport's top edge the rail reads as clipped
    // rather than pinned, so it keeps the same breathing room `Content` gives it
    // before it sticks.
    top: STICKY_TOP,
    // No `alignSelf: flex-start` here: that content-sizes a flex child and stops
    // it travelling past its own height, which is the silent way a sticky
    // sidebar stops sticking. The parent's default `stretch` is what this needs.
    height: '100%',
    maxHeight: `calc(100dvh - ${PLUGIN_CONTENT_VIEWPORT_OFFSET}px)`,
    width: RAIL_WIDTH,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${theme.palette.divider}`,
    paddingRight: theme.spacing(2),
    [theme.breakpoints.down('md')]: {
      width: RAIL_WIDTH_COMPACT,
    },
    '&[data-collapsed="true"]': {
      width: RAIL_WIDTH_COLLAPSED,
      paddingRight: theme.spacing(1),
      alignItems: 'center',
    },
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    paddingBottom: theme.spacing(1.5),
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    display: 'block',
    fontSize: theme.typography.body2.fontSize,
    fontWeight: theme.typography.fontWeightBold as number,
  },
  // The only scrolling element. `minHeight: 0` is what lets a flex child
  // actually shrink enough to scroll rather than pushing the container taller.
  scroller: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    paddingRight: theme.spacing(0.5),
  },
  skeletons: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  footnote: {
    display: 'block',
    marginTop: theme.spacing(2),
    paddingTop: theme.spacing(1),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  notice: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
  },
  // Collapsed: the expand button, then one dot-and-count per non-empty group.
  strip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    paddingTop: theme.spacing(1.5),
  },
  stripGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.spacing(0.25),
  },
  stripDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  stripUnknown: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.fontWeightBold as number,
    color: theme.palette.text.secondary,
    cursor: 'default',
  },
  stripCount: {
    fontSize: theme.typography.caption.fontSize,
    fontVariantNumeric: 'tabular-nums',
    color: theme.palette.text.secondary,
  },
}));

type SessionSwitcherRailProps = {
  installation: string;
  /** The session being viewed, highlighted when it is in the rail. */
  currentSessionId?: string;
  /**
   * The detail page's own reading of that session's state, which overrides the
   * backend summary's entry for it — the page's tasks poll is always fresher
   * than a summary cached for 15 s. See `withCurrentSessionState`.
   */
  currentSessionState?: SessionStateEntry;
};

/**
 * The operator's active sessions, beside the one they are reading.
 *
 * Populated with **non-terminal sessions only**, grouped Waiting then Running —
 * kagent has no queued state, so the prototype's third group has nothing behind
 * it. See "The session switcher rail" in `docs/agent-platform.md` for why it is
 * scoped to this installation and why it does not apply the five-minute activity
 * bound the composer's "Working…" indicator does.
 */
export function SessionSwitcherRail({
  installation,
  currentSessionId,
  currentSessionState,
}: SessionSwitcherRailProps) {
  const classes = useStyles();
  const theme = useTheme();
  const [collapsed, setCollapsed] = useRailCollapsed();
  const {
    groups,
    activeCount,
    isLoading,
    isStatesLoading,
    isError,
    isPartial,
    unreadableCount,
    skippedCount,
    now,
    refetch,
  } = useSessionSwitcher(installation, { currentSessionState });

  const toggle = (
    <ButtonIcon
      variant="tertiary"
      size="small"
      // Direction follows the glyphs, which are drawn for a left-hand panel:
      // close points left, toward the edge the rail folds to; open points right,
      // back into the content.
      icon={collapsed ? <ArrowMenuOpenIcon /> : <ArrowMenuCloseIcon />}
      aria-label={
        collapsed ? 'Expand session switcher' : 'Collapse session switcher'
      }
      aria-expanded={!collapsed}
      // Set only when expanded, because the element it names is only rendered
      // then. Pointing it at a missing id is worse than omitting it: a reader
      // that follows the reference finds no target, so the relationship would
      // break precisely when `aria-expanded` is false — the state it exists to
      // describe.
      {...(collapsed ? {} : { 'aria-controls': SESSIONS_REGION_ID })}
      onClick={() => setCollapsed(!collapsed)}
    />
  );

  if (collapsed) {
    // Not hidden outright. The rail answers "is anything waiting on me?", and a
    // strip can keep answering it — which also spares us a floating re-open
    // affordance on a page with no toolbar to hang one on (the kebab lives in
    // the shared plugin header, and a second control injected there would fight
    // useProvidePageHeaderActions).
    return (
      <nav
        className={classes.root}
        data-collapsed="true"
        aria-label="Active sessions"
      >
        <div className={classes.strip}>
          {toggle}
          {(isPartial || isError) && (
            // The strip exists so it can keep answering "is anything waiting on
            // me?" — so it has to be able to answer "cannot tell" too. Without
            // this it renders empty, which reads as an idle fleet: the exact
            // over-claim the expanded rail's empty state was fixed to avoid.
            <Tooltip
              title={
                isError
                  ? 'Couldn’t load active sessions'
                  : 'Some sessions couldn’t be read'
              }
            >
              <span className={classes.stripUnknown}>?</span>
            </Tooltip>
          )}
          {groups.map(group => (
            // MUI's Tooltip, not bui's: bui wraps react-aria's TooltipTrigger,
            // which only wires up its own focusable components, and this is a
            // span.
            <Tooltip
              key={group.key}
              title={`${group.sessions.length} ${group.label.toLowerCase()}`}
            >
              <div className={classes.stripGroup}>
                <span
                  className={classes.stripDot}
                  style={{ backgroundColor: toneColor(group.tone, theme) }}
                />
                <span className={classes.stripCount}>
                  {group.sessions.length}
                </span>
              </div>
            </Tooltip>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav className={classes.root} aria-label="Active sessions">
      <div className={classes.header}>
        <div className={classes.headerText}>
          <Text as="span" className={classes.title}>
            Active sessions
          </Text>
          {!isLoading && !isStatesLoading && !isError && (
            <Text as="span" variant="body-small" color="secondary">
              {/* One string, not spliced nodes: `+` marks the count as a floor
                  when the summary is incomplete, since with sessions unread or
                  never evaluated a bare number would state a total we do not
                  know. */}
              {`${activeCount}${isPartial ? '+' : ''} non-terminal`}
            </Text>
          )}
        </div>
        {toggle}
      </div>

      <div
        id={SESSIONS_REGION_ID}
        className={classes.scroller}
        aria-busy={isLoading || isStatesLoading ? true : undefined}
      >
        <RailBody
          isLoading={isLoading}
          isStatesLoading={isStatesLoading}
          isError={isError}
          groups={groups}
          unreadableCount={unreadableCount}
          skippedCount={skippedCount}
          currentSessionId={currentSessionId}
          now={now}
          onRetry={refetch}
        />
      </div>
    </nav>
  );
}

function RailBody({
  isLoading,
  isStatesLoading,
  isError,
  groups,
  unreadableCount,
  skippedCount,
  currentSessionId,
  now,
  onRetry,
}: {
  isLoading: boolean;
  isStatesLoading: boolean;
  isError: boolean;
  groups: ReturnType<typeof useSessionSwitcher>['groups'];
  unreadableCount: number;
  skippedCount: number;
  currentSessionId?: string;
  now: number;
  onRetry: () => void;
}) {
  const classes = useStyles();

  if (isError) {
    // No fallback to "recent sessions". Without states we cannot tell which are
    // non-terminal, and a rail that presented finished sessions as active would
    // invert the one claim it makes. No page-level Alert either: the
    // conversation beside it is unaffected.
    return (
      <div className={classes.notice}>
        <Text variant="body-small" color="secondary">
          Couldn’t load active sessions.
        </Text>
        <Button variant="tertiary" size="small" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading || isStatesLoading) {
    // Ungrouped, and deliberately not the real titles. Until the states land we
    // do not know which sessions are non-terminal, so rendering all of them only
    // to have most vanish a moment later is worse than a placeholder — the
    // rail's whole claim is that these are active.
    return (
      <div className={classes.skeletons}>
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} height="64px" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    // "All caught up." is a claim, and it is only true when the summary was
    // complete. With sessions unread or never evaluated, an empty result means
    // we cannot tell — and the reassuring copy would hide exactly the session
    // the rail exists to surface (one blocked for days has an old `updated_at`,
    // so it is the first to fall past the cap).
    if (unreadableCount > 0 || skippedCount > 0) {
      return (
        <div className={classes.notice}>
          <Text variant="body-small" color="secondary">
            Couldn’t tell what’s active.
          </Text>
          <Text variant="body-small" color="secondary">
            {describeIncomplete(unreadableCount, skippedCount)}
          </Text>
          <Button variant="tertiary" size="small" onClick={onRetry}>
            Retry
          </Button>
        </div>
      );
    }
    return (
      <Text variant="body-small" color="secondary">
        All caught up.
      </Text>
    );
  }

  return (
    <>
      {groups.map(group => (
        <SessionSwitcherGroup
          key={group.key}
          group={group}
          currentSessionId={currentSessionId}
          now={now}
        />
      ))}
      {(unreadableCount > 0 || skippedCount > 0) && (
        // Shown beneath the groups rather than as an alert: what is listed is
        // still usable, it just is not everything.
        <Text
          as="span"
          variant="body-small"
          color="secondary"
          className={classes.footnote}
        >
          {describeIncomplete(unreadableCount, skippedCount)}
        </Text>
      )}
    </>
  );
}

/**
 * Why the rail's list is incomplete, in the fewest words a 280px column allows.
 *
 * The two counts mean different things and are worth separating: `unreadable` is
 * "we asked and failed", `skipped` is "we never asked" (past the activity
 * window, past the cap, or cut off by the pass budget). Either way the operator
 * should know the list is a subset before trusting it.
 */
function describeIncomplete(unreadable: number, skipped: number): string {
  const parts: string[] = [];
  if (unreadable > 0) {
    parts.push(`${unreadable} couldn’t be read`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} not checked`);
  }
  return `${parts.join(', ')}.`;
}
