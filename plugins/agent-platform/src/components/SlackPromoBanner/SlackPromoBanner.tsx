import { ButtonIcon, Text } from '@backstage/ui';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import { makeStyles } from '@material-ui/core/styles';
import CloseIcon from '@material-ui/icons/Close';

import { useDismissedHint } from '../../hooks/useDismissedHint';

/** The app-config switch a platform admin sets once Slack is wired up. */
export const SLACK_INTEGRATION_CONFIG_KEY = 'agentPlatform.integrations.slack';

/** The id the dismissal is stored under (see `useDismissedHint`). */
const HINT_ID = 'slackPromo';

const useStyles = makeStyles({
  banner: {
    position: 'relative',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 24,
    padding: '20px 22px',
    border: '1px solid var(--agent-shell-rail-item-active-border, #dfe7ec)',
    borderRadius: 16,
    background: 'var(--agent-shell-rail-bg, #f0f7f9)',
    '@media (max-width: 599px)': {
      padding: 16,
      gap: 16,
    },
  },
  dismiss: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  // The illustration: a Slack thread in miniature. Decorative only — the copy
  // beside it says everything it shows.
  thread: {
    flex: '1 1 260px',
    minWidth: 0,
    maxWidth: 320,
    border: '1px solid var(--agent-shell-rail-item-active-border, #dfe7ec)',
    borderRadius: 12,
    background: 'var(--bui-bg-neutral-1, #ffffff)',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0, 38, 69, 0.08)',
    fontSize: 12.5,
    lineHeight: 1.45,
    color: 'var(--bui-fg-primary, #002645)',
  },
  threadHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 32,
    padding: '0 12px',
    borderBottom: '1px solid var(--bui-border-1, #e3ebef)',
    fontWeight: 500,
  },
  muted: {
    color: 'var(--bui-fg-secondary, #5b6c79)',
    fontWeight: 400,
  },
  author: {
    fontWeight: 500,
  },
  time: {
    fontSize: 11,
  },
  threadLabel: {
    marginLeft: 'auto',
    fontSize: 11,
  },
  threadBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
  },
  message: {
    display: 'flex',
    gap: 8,
  },
  tile: {
    width: 24,
    height: 24,
    flex: 'none',
    borderRadius: 6,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 500,
  },
  personTile: {
    background: 'var(--agent-shell-avatar-bg, #002645)',
    color: 'var(--agent-shell-avatar-fg, #ffffff)',
  },
  agentTile: {
    background: 'var(--bui-positive-bg-subdued, #ddf5e3)',
    color: 'var(--bui-positive-fg-subdued, #14612a)',
    fontWeight: 700,
  },
  mention: {
    color: 'var(--bui-ring, #00609c)',
    background: 'var(--bui-announcement-bg-subdued, #dff1ff)',
    borderRadius: 4,
    padding: '0 3px',
  },
  appBadge: {
    fontSize: 10,
    padding: '0 4px',
    borderRadius: 3,
    background: 'var(--bui-bg-neutral-2, #f0f4f6)',
    color: 'var(--bui-fg-secondary, #5b6c79)',
  },
  replyActions: {
    display: 'flex',
    gap: 6,
    marginTop: 6,
    '& > span': {
      padding: '2px 8px',
      border: '1px solid var(--bui-border-2, #d6e1e7)',
      borderRadius: 6,
      fontSize: 11.5,
    },
  },
  // The agent "types", then its answer fades in — a loop, held still for
  // people who asked for less motion.
  typing: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 32,
    fontSize: 11.5,
    color: 'var(--bui-fg-secondary, #5b6c79)',
    animation: '$typing 6s ease-in-out infinite',
    '@media (prefers-reduced-motion: reduce)': {
      display: 'none',
    },
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--agent-platform-state-dot-neutral, #9fb2c0)',
    display: 'inline-block',
    animation: '$dot 1s ease-in-out infinite',
    '&:nth-child(2)': { animationDelay: '0.2s' },
    '&:nth-child(3)': { animationDelay: '0.4s' },
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  },
  reply: {
    animation: '$reply 6s ease-in-out infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
      opacity: 1,
      transform: 'none',
    },
  },
  '@keyframes reply': {
    '0%, 30%': { opacity: 0, transform: 'translateY(6px)' },
    '40%, 92%': { opacity: 1, transform: 'none' },
    '100%': { opacity: 0 },
  },
  '@keyframes typing': {
    '0%, 8%': { opacity: 0 },
    '12%, 30%': { opacity: 1 },
    '34%, 100%': { opacity: 0 },
  },
  '@keyframes dot': {
    '0%, 100%': { opacity: 0.3 },
    '50%': { opacity: 1 },
  },
  copy: {
    flex: '1 1 240px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    // Clear of the dismiss button in the corner.
    paddingRight: 28,
  },
});

function ThreadPreview() {
  const classes = useStyles();
  return (
    <div className={classes.thread} aria-hidden="true">
      <div className={classes.threadHeader}>
        <span className={classes.muted}>#</span>support
        <span className={`${classes.muted} ${classes.threadLabel}`}>
          Thread
        </span>
      </div>
      <div className={classes.threadBody}>
        <div className={classes.message}>
          <span className={`${classes.tile} ${classes.personTile}`}>SK</span>
          <div>
            <span className={classes.author}>Sam</span>{' '}
            <span className={`${classes.muted} ${classes.time}`}>09:02</span>
            <br />
            <span className={classes.mention}>@Support Triage</span> what came
            in overnight?
          </div>
        </div>
        <div className={classes.typing}>
          <span className={classes.dot} />
          <span className={classes.dot} />
          <span className={classes.dot} />
          Support Triage is working…
        </div>
        <div className={`${classes.message} ${classes.reply}`}>
          <span className={`${classes.tile} ${classes.agentTile}`}>ST</span>
          <div>
            <span className={classes.author}>Support Triage</span>{' '}
            <span className={classes.appBadge}>APP</span>
            <br />9 new tickets. 2 look urgent. Post the summary to
            #support-weekly?
            <div className={classes.replyActions}>
              <span>Post it</span>
              <span>Show tickets</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The banner itself, mounted only once the integration is switched on so an
 * unconfigured portal never even reads the dismissal from user settings.
 */
function SlackPromoBannerContent() {
  const classes = useStyles();
  const { dismissed, isKnown, dismiss } = useDismissedHint(HINT_ID);

  // Held back until the stored dismissal is known, so a banner the person
  // already closed doesn't flash on every visit.
  if (!isKnown || dismissed) {
    return null;
  }

  return (
    <section className={classes.banner} aria-label="Use agents in Slack">
      <ButtonIcon
        className={classes.dismiss}
        variant="tertiary"
        size="small"
        icon={<CloseIcon fontSize="small" />}
        aria-label="Dismiss, and don't show this again"
        onPress={() => {
          dismiss().catch(() => {});
        }}
      />
      <ThreadPreview />
      <div className={classes.copy}>
        <Text as="h2" variant="title-x-small">
          Use your agents right in Slack
        </Text>
        <Text as="p" variant="body-medium" color="secondary">
          Mention an agent in any channel, or send it a direct message. It
          answers in the thread, with the same skills and connectors it has
          here.
        </Text>
      </div>
    </section>
  );
}

/**
 * The new-session home's Slack promo (the Main artboard's banner, gap G18):
 * the platform's Slack integration exists, the portal only points people at
 * it. Shown only where a platform admin switched it on with
 * `agentPlatform.integrations.slack: true` (signed-in config) — renders
 * nothing at all otherwise — and gone for good, per person, once dismissed.
 */
export function SlackPromoBanner() {
  const { config } = useSignedInConfig();
  const enabled =
    config?.getOptionalBoolean(SLACK_INTEGRATION_CONFIG_KEY) === true;

  return enabled ? <SlackPromoBannerContent /> : null;
}
