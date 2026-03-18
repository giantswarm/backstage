import { Button, IconButton, Tooltip, makeStyles } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import AddIcon from '@material-ui/icons/Add';
import { Thread } from '../AiChat/Thread';
import { DEFAULT_WIDTH, useDrawerResize } from './useDrawerResize';

const useStyles = makeStyles(theme => ({
  drawer: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: DEFAULT_WIDTH,
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
  resizeHandle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 6,
    height: '100%',
    cursor: 'col-resize',
    zIndex: 1,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    [theme.breakpoints.down('xs')]: {
      display: 'none',
    },
  },
  resizeHandleDragging: {
    backgroundColor: theme.palette.primary.main,
    opacity: 0.3,
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
  const { width, drawerRef, resizeHandleProps, isDragging } = useDrawerResize({
    variant,
    open,
  });

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
      <div
        ref={drawerRef}
        className={classes.drawer}
        style={width ? { width } : undefined}
      >
        <div
          className={`${classes.resizeHandle}${isDragging ? ` ${classes.resizeHandleDragging}` : ''}`}
          {...resizeHandleProps}
        />
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
