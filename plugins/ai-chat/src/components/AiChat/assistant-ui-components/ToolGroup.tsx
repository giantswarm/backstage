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
import { Collapse, makeStyles, createStyles } from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import LoopIcon from '@material-ui/icons/Loop';
import { useScrollLock, useAuiState } from '@assistant-ui/react';
import classNames from 'classnames';

const ANIMATION_DURATION = 200;

function formatToolSummary(names: string[]): string {
  const counts = new Map<string, number>();
  for (const t of names) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, n]) => (n > 1 ? `${name} x${n}` : name))
    .join(', ');
}

const useStyles = makeStyles(theme =>
  createStyles({
    root: {
      width: '100%',
    },
    rootOutline: {
      borderRadius: 'var(--bui-radius-3)',
      border: `1px solid ${theme.palette.divider}`,
      paddingTop: theme.spacing(3),
      paddingBottom: theme.spacing(3),
    },
    rootMuted: {
      borderRadius: 'var(--bui-radius-3)',
      border: `1px solid ${theme.palette.divider}`,
      backgroundColor: 'var(--bui-bg-neutral-2)',
      paddingTop: theme.spacing(3),
      paddingBottom: theme.spacing(3),
    },
    trigger: {
      display: 'flex',
      gap: theme.spacing(0.75),
      alignItems: 'flex-start',
      fontSize: '0.8125rem',
      lineHeight: 1.4,
      color: theme.palette.text.primary,
      cursor: 'pointer',
      border: 'none',
      background: 'none',
      padding: 0,
      transition: theme.transitions.create('color'),
      '&:hover': {
        color: theme.palette.text.secondary,
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
    triggerLabel: {
      position: 'relative',
      display: 'inline-block',
      textAlign: 'left',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    triggerLabelGrow: {
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
      width: 14,
      height: 14,
      flexShrink: 0,
      transition: `transform ${ANIMATION_DURATION}ms ease-out`,
      transform: 'rotate(0deg)',
      marginTop: '2.5px',
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
      marginTop: theme.spacing(1),
      paddingLeft: theme.spacing(2),
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
    statusBadge: {
      width: '14px',
      height: '14px',
      marginRight: '4px',
      display: 'inline-block',
      verticalAlign: 'text-bottom',
      transform: 'scaleX(-1)',
    },
    statusBadgeRunning: {
      animation: '$spin 1s linear infinite',
    },
    '@keyframes spin': {
      from: { transform: 'scaleX(-1) rotate(0deg)' },
      to: { transform: 'scaleX(-1) rotate(-360deg)' },
    },
    tools: {
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
      margin: theme.spacing(1, 0),
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
  breakdown?: string;
  className?: string;
  onClick?: () => void;
};

function ToolGroupTrigger({
  count,
  active = false,
  breakdown,
  className,
  onClick,
}: ToolGroupTriggerProps) {
  const context = useContext(ToolGroupContext);
  if (!context) {
    throw new Error('ToolGroupTrigger must be used within ToolGroupRoot');
  }
  const { isOpen, handleOpenChange, variant } = context;
  const classes = useStyles();

  const label = breakdown
    ? `${count} tool ${count === 1 ? 'call' : 'calls'} (${breakdown})`
    : `${count} tool ${count === 1 ? 'call' : 'calls'}`;

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
      <ExpandMoreIcon
        data-slot="tool-group-trigger-chevron"
        className={classNames(classes.chevron, {
          [classes.chevronClosed]: !isOpen,
        })}
      />
      <span
        data-slot="tool-group-trigger-label"
        className={classNames(classes.triggerLabel, {
          [classes.triggerLabelGrow]:
            variant === 'outline' || variant === 'muted',
        })}
      >
        {active && (
          <LoopIcon
            className={classNames(
              classes.statusBadge,
              classes.statusBadgeRunning,
            )}
          />
        )}
        <span>{label}</span>
      </span>
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
          <div className={classes.tools}>{children}</div>
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

const MIN_GROUP_SIZE = 3;

const ToolGroupImpl: FC<
  PropsWithChildren<{ startIndex: number; endIndex: number }>
> = ({ children, startIndex, endIndex }) => {
  const classes = useStyles();
  const toolCount = endIndex - startIndex + 1;

  const breakdown = useAuiState(s => {
    if (toolCount < MIN_GROUP_SIZE) return undefined;
    const names = s.message.parts
      .slice(startIndex, endIndex + 1)
      .filter(
        (p): p is typeof p & { type: 'tool-call'; toolName: string } =>
          p.type === 'tool-call',
      )
      .map(p => p.toolName);
    return names.length > 0 ? formatToolSummary(names) : undefined;
  });

  const isActive = useAuiState(s => {
    if (toolCount < MIN_GROUP_SIZE) return false;
    return s.message.parts
      .slice(startIndex, endIndex + 1)
      .some(p => p.status?.type === 'running');
  });

  if (toolCount < MIN_GROUP_SIZE) {
    return <div className={classes.tools}>{children}</div>;
  }

  return (
    <ToolGroupRoot>
      <ToolGroupTrigger
        count={toolCount}
        active={isActive}
        breakdown={breakdown}
      />
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
