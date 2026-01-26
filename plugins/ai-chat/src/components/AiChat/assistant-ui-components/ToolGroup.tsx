import {
  memo,
  useCallback,
  useRef,
  useState,
  useContext,
  createContext,
  type FC,
  type PropsWithChildren,
} from 'react';
import {
  Collapse,
  makeStyles,
  createStyles,
  CircularProgress,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { useScrollLock } from '@assistant-ui/react';
import classNames from 'classnames';

const ANIMATION_DURATION = 200;

const useStyles = makeStyles(theme =>
  createStyles({
    root: {
      width: '100%',
    },
    rootOutline: {
      borderRadius: theme.spacing(1),
      border: `1px solid ${theme.palette.divider}`,
      paddingTop: theme.spacing(3),
      paddingBottom: theme.spacing(3),
    },
    rootMuted: {
      borderRadius: theme.spacing(1),
      border: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.action.hover,
      paddingTop: theme.spacing(3),
      paddingBottom: theme.spacing(3),
    },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      fontSize: theme.typography.body2.fontSize,
      color: theme.palette.text.primary,
      cursor: 'pointer',
      border: 'none',
      background: 'none',
      padding: 0,
      transition: theme.transitions.create('color'),
      '&:hover': {
        color: theme.palette.text.secondary,
      },
      '& > *:not(:last-child)': {
        marginRight: theme.spacing(1),
      },
    },
    triggerOutline: {
      width: '100%',
      paddingLeft: theme.spacing(4),
      paddingRight: theme.spacing(4),
    },
    triggerMuted: {
      width: '100%',
      paddingLeft: theme.spacing(4),
      paddingRight: theme.spacing(4),
    },
    loader: {
      flexShrink: 0,
    },
    labelWrapper: {
      position: 'relative',
      display: 'inline-block',
      textAlign: 'left',
      fontWeight: theme.typography.fontWeightMedium as number,
      lineHeight: 1,
    },
    labelWrapperGrow: {
      flexGrow: 1,
    },
    shimmer: {
      pointerEvents: 'none',
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      '@media (prefers-reduced-motion)': {
        animation: 'none',
      },
    },
    chevron: {
      fontSize: 16,
      flexShrink: 0,
      transition: `transform ${ANIMATION_DURATION}ms ease-out`,
      transform: 'rotate(0deg)',
    },
    chevronClosed: {
      transform: 'rotate(-90deg)',
    },
    content: {
      position: 'relative',
      overflow: 'hidden',
      fontSize: theme.typography.body2.fontSize,
      outline: 'none',
    },
    contentInner: {
      marginTop: theme.spacing(2),
      display: 'flex',
      flexDirection: 'column',
      '& > *:not(:last-child)': {
        marginBottom: theme.spacing(2),
      },
    },
    contentInnerOutline: {
      marginTop: theme.spacing(3),
      borderTop: `1px solid ${theme.palette.divider}`,
      paddingLeft: theme.spacing(4),
      paddingRight: theme.spacing(4),
      paddingTop: theme.spacing(3),
    },
    contentInnerMuted: {
      marginTop: theme.spacing(3),
      borderTop: `1px solid ${theme.palette.divider}`,
      paddingLeft: theme.spacing(4),
      paddingRight: theme.spacing(4),
      paddingTop: theme.spacing(3),
    },
  }),
);

export type ToolGroupRootProps = {
  variant?: 'default' | 'outline' | 'muted';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  className?: string;
  children?: React.ReactNode;
};

const ToolGroupContext = createContext<{
  isOpen: boolean;
  handleOpenChange: (open: boolean) => void;
  variant: 'default' | 'outline' | 'muted';
} | null>(null);

function ToolGroupRoot({
  className,
  variant = 'default',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
}: ToolGroupRootProps) {
  const classes = useStyles();
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        lockScroll();
      }
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [lockScroll, isControlled, controlledOnOpenChange],
  );

  return (
    <ToolGroupContext.Provider value={{ isOpen, handleOpenChange, variant }}>
      <div
        ref={collapsibleRef}
        data-slot="tool-group-root"
        data-variant={variant}
        className={classNames(
          classes.root,
          {
            [classes.rootOutline]: variant === 'outline',
            [classes.rootMuted]: variant === 'muted',
          },
          className,
        )}
      >
        {children}
      </div>
    </ToolGroupContext.Provider>
  );
}

type ToolGroupTriggerProps = {
  count: number;
  active?: boolean;
  className?: string;
  onClick?: () => void;
};

function ToolGroupTrigger({
  count,
  active = false,
  className,
  onClick,
}: ToolGroupTriggerProps) {
  const context = useContext(ToolGroupContext);
  if (!context) {
    throw new Error('ToolGroupTrigger must be used within ToolGroupRoot');
  }
  const { isOpen, handleOpenChange, variant } = context;
  const classes = useStyles();

  const label = `${count} tool ${count === 1 ? 'call' : 'calls'}`;

  const handleClick = () => {
    handleOpenChange(!isOpen);
    onClick?.();
  };

  return (
    <button
      type="button"
      data-slot="tool-group-trigger"
      onClick={handleClick}
      className={classNames(
        classes.trigger,
        {
          [classes.triggerOutline]: variant === 'outline',
          [classes.triggerMuted]: variant === 'muted',
        },
        className,
      )}
    >
      {active && (
        <CircularProgress
          data-slot="tool-group-trigger-loader"
          size={16}
          className={classes.loader}
        />
      )}
      <span
        data-slot="tool-group-trigger-label"
        className={classNames(classes.labelWrapper, {
          [classes.labelWrapperGrow]:
            variant === 'outline' || variant === 'muted',
        })}
      >
        <span>{label}</span>
        {active && (
          <span
            aria-hidden
            data-slot="tool-group-trigger-shimmer"
            className={classes.shimmer}
          >
            {label}
          </span>
        )}
      </span>
      <ExpandMoreIcon
        data-slot="tool-group-trigger-chevron"
        className={classNames(classes.chevron, {
          [classes.chevronClosed]: !isOpen,
        })}
      />
    </button>
  );
}

type ToolGroupContentProps = {
  className?: string;
  children?: React.ReactNode;
};

function ToolGroupContent({ className, children }: ToolGroupContentProps) {
  const context = useContext(ToolGroupContext);
  if (!context) {
    throw new Error('ToolGroupContent must be used within ToolGroupRoot');
  }
  const { isOpen, variant } = context;
  const classes = useStyles();

  return (
    <Collapse in={isOpen} timeout={ANIMATION_DURATION}>
      <div
        data-slot="tool-group-content"
        className={classNames(classes.content, className)}
      >
        <div
          className={classNames(classes.contentInner, {
            [classes.contentInnerOutline]: variant === 'outline',
            [classes.contentInnerMuted]: variant === 'muted',
          })}
        >
          {children}
        </div>
      </div>
    </Collapse>
  );
}

type ToolGroupComponent = FC<
  PropsWithChildren<{ startIndex: number; endIndex: number }>
> & {
  Root: typeof ToolGroupRoot;
  Trigger: typeof ToolGroupTrigger;
  Content: typeof ToolGroupContent;
};

const ToolGroupImpl: FC<
  PropsWithChildren<{ startIndex: number; endIndex: number }>
> = ({ children, startIndex, endIndex }) => {
  const toolCount = endIndex - startIndex + 1;

  return (
    <ToolGroupRoot>
      <ToolGroupTrigger count={toolCount} />
      <ToolGroupContent>{children}</ToolGroupContent>
    </ToolGroupRoot>
  );
};

const ToolGroup = memo(ToolGroupImpl) as unknown as ToolGroupComponent;

ToolGroup.displayName = 'ToolGroup';
ToolGroup.Root = ToolGroupRoot;
ToolGroup.Trigger = ToolGroupTrigger;
ToolGroup.Content = ToolGroupContent;

export { ToolGroup, ToolGroupRoot, ToolGroupTrigger, ToolGroupContent };
