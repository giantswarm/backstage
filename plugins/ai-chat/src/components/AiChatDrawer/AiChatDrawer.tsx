import { useEffect } from 'react';
import { Button, IconButton, Tooltip, makeStyles } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import AddIcon from '@material-ui/icons/Add';
import { Thread } from '../AiChat/Thread';

const DRAWER_WIDTH = 500;

const useStyles = makeStyles(theme => ({
  drawer: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: DRAWER_WIDTH,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: theme.palette.background.paper,
    borderLeft: `1px solid ${theme.palette.divider}`,
    zIndex: theme.zIndex.appBar,
    [theme.breakpoints.down('xs')]: {
      width: '100vw',
    },
  },
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: theme.zIndex.appBar - 1,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  threadRoot: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  newThreadButton: {
    textTransform: 'none',
  },
}));

export type AiChatDrawerVariant = 'persistent' | 'overlay';

interface AiChatDrawerProps {
  open: boolean;
  onClose(): void;
  onNewConversation(): void;
  variant: AiChatDrawerVariant;
}

export const AiChatDrawer = ({
  open,
  onClose,
  onNewConversation,
  variant,
}: AiChatDrawerProps) => {
  const classes = useStyles();

  // Shrink the main content area when the drawer is open in persistent mode.
  useEffect(() => {
    if (!open || variant !== 'persistent') {
      return undefined;
    }

    const rootEl = document.getElementById('root');
    if (!rootEl) {
      return undefined;
    }

    rootEl.style.marginRight = `${DRAWER_WIDTH}px`;

    return () => {
      rootEl.style.marginRight = '';
    };
  }, [open, variant]);

  if (!open) {
    return null;
  }

  return (
    <>
      {variant === 'overlay' && (
        <div
          className={classes.backdrop}
          role="button"
          tabIndex={0}
          aria-label="Close AI chat"
          onClick={onClose}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
              onClose();
            }
          }}
        />
      )}
      <div className={classes.drawer}>
        <div className={classes.header}>
          <div className={classes.headerLeft}>
            <Tooltip title="New conversation">
              <Button
                className={classes.newThreadButton}
                size="small"
                startIcon={<AddIcon />}
                onClick={onNewConversation}
              >
                New Thread
              </Button>
            </Tooltip>
          </div>
          <Tooltip title="Close">
            <IconButton size="small" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </div>
        <Thread className={classes.threadRoot} />
      </div>
    </>
  );
};
