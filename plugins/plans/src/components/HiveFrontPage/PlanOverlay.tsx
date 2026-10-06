import { useEffect } from 'react';
import { ButtonIcon, ButtonLink, Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import { sidebarConfig, useSidebarPinState } from '@backstage/core-components';
import { useHiveDetail } from '../../hooks/useHiveDetail';
import { PlanReview } from '../PullReviewPage';

const useStyles = makeStyles((theme: Theme) => ({
  // Over the app's content column, like a plan document's full screen: the
  // page underneath is covered, the app sidebar stays visible and usable.
  // `left` and `bottom` follow the sidebar's state and are set inline.
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bui-bg-app)',
    // Below the sidebar, so its fly-out opens over the review.
    zIndex: theme.zIndex.appBar - 1,
    transition: 'left 0.1s ease-out',
  },
  bar: {
    flexShrink: 0,
    padding: 'var(--bui-space-3) var(--bui-space-6)',
    borderBottom: '1px solid var(--bui-border-1)',
    backgroundColor: 'var(--bui-bg-neutral-1)',
  },
  body: {
    flexGrow: 1,
    minHeight: 0,
    overflow: 'auto',
    // Reaching the end of the review must not scroll the page underneath.
    overscrollBehavior: 'contain',
    padding: 'var(--bui-space-6)',
  },
}));

/**
 * A plan's review opened over the front page (`?pr=<n>&repo=<repo>`): the
 * whole review — documents, inline comments, discussion — without leaving
 * the page. The close button or Escape returns to the same place.
 */
export function PlanOverlay() {
  const classes = useStyles();
  const { pull, close } = useHiveDetail();
  const { isPinned, isMobile } = useSidebarPinState();

  useEffect(() => {
    if (!pull) {
      return undefined;
    }
    // A comment composer or a menu inside handles its own Escape first.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pull, close]);

  if (!pull) {
    return null;
  }

  const inset = isMobile
    ? { left: 0, bottom: sidebarConfig.mobileSidebarHeight }
    : {
        left: isPinned
          ? sidebarConfig.drawerWidthOpen
          : sidebarConfig.drawerWidthClosed,
        bottom: 0,
      };
  const githubUrl = pull.repo
    ? `https://github.com/${pull.repo}/pull/${pull.number}`
    : undefined;

  return (
    <div
      className={classes.overlay}
      style={inset}
      role="dialog"
      aria-label={`Plan review #${pull.number}`}
    >
      <Flex className={classes.bar} align="center" justify="between" gap="3">
        <Text variant="body-medium" color="secondary">
          {`Plan review${pull.repo ? ` · ${pull.repo}#${pull.number}` : ''}`}
        </Text>
        <Flex align="center" gap="2">
          {githubUrl && (
            <ButtonLink
              href={githubUrl}
              variant="tertiary"
              size="small"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </ButtonLink>
          )}
          <ButtonIcon
            aria-label="Close the review"
            icon={<CloseIcon fontSize="small" />}
            variant="secondary"
            size="small"
            onPress={close}
          />
        </Flex>
      </Flex>
      <div className={classes.body}>
        <PlanReview pullNumber={pull.number} docParam="file" overlay />
      </div>
    </div>
  );
}
