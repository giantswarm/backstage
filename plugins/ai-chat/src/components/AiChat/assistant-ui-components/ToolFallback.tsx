import { memo, useCallback, useRef, useState } from 'react';
import ErrorIcon from '@material-ui/icons/Error';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import LoopIcon from '@material-ui/icons/Loop';
import CancelIcon from '@material-ui/icons/Cancel';
import { Collapse, makeStyles } from '@material-ui/core';
import {
  type ToolCallMessagePartStatus,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';

const ANIMATION_DURATION = 200;

const useStyles = makeStyles(theme => ({
  root: {
    width: '100%',
    borderRadius: theme.spacing(1),
    border: `1px solid ${theme.palette.divider}`,
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
  },
  rootCancelled: {
    borderColor: theme.palette.action.disabled,
    backgroundColor: theme.palette.action.hover,
  },
  trigger: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing(1),
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    fontSize: theme.typography.body2.fontSize,
    cursor: 'pointer',
    transition: theme.transitions.create('color'),
    border: 'none',
    background: 'none',
    textAlign: 'left',
    '&:hover': {
      opacity: 0.8,
    },
  },
  icon: {
    fontSize: 16,
    flexShrink: 0,
  },
  iconCancelled: {
    color: theme.palette.text.disabled,
  },
  iconRunning: {
    animation: '$spin 1s linear infinite',
  },
  '@keyframes spin': {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
  labelWrapper: {
    position: 'relative',
    display: 'inline-block',
    flexGrow: 1,
    textAlign: 'left',
    lineHeight: 1,
  },
  labelCancelled: {
    color: theme.palette.text.disabled,
    textDecoration: 'line-through',
  },
  shimmer: {
    pointerEvents: 'none',
    position: 'absolute',
    inset: 0,
    '@media (prefers-reduced-motion)': {
      animation: 'none',
    },
  },
  chevron: {
    fontSize: 16,
    flexShrink: 0,
    transition: theme.transitions.create('transform', {
      duration: ANIMATION_DURATION,
      easing: theme.transitions.easing.easeOut,
    }),
  },
  chevronOpen: {
    transform: 'rotate(0deg)',
  },
  chevronClosed: {
    transform: 'rotate(-90deg)',
  },
  content: {
    position: 'relative',
    overflow: 'hidden',
    fontSize: theme.typography.body2.fontSize,
  },
  contentInner: {
    marginTop: theme.spacing(1.5),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    borderTop: `1px solid ${theme.palette.divider}`,
    paddingTop: theme.spacing(1),
  },
  args: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
  },
  argsValue: {
    whiteSpace: 'pre-wrap',
    fontFamily: 'monospace',
  },
  result: {
    borderTop: `1px dashed ${theme.palette.divider}`,
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    paddingTop: theme.spacing(1),
  },
  resultHeader: {
    fontWeight: 600,
  },
  resultContent: {
    whiteSpace: 'pre-wrap',
    fontFamily: 'monospace',
  },
  error: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
  },
  errorHeader: {
    fontWeight: 600,
    color: theme.palette.text.disabled,
  },
  errorReason: {
    color: theme.palette.text.disabled,
  },
  argsCancelled: {
    opacity: 0.6,
  },
}));

export type ToolFallbackRootProps = {
  className?: string;
  children?: React.ReactNode;
};

function ToolFallbackRoot({ className, children }: ToolFallbackRootProps) {
  const classes = useStyles();
  const collapsibleRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={collapsibleRef}
      data-slot="tool-fallback-root"
      className={`${classes.root} ${className || ''}`}
    >
      {children}
    </div>
  );
}

type ToolStatus = ToolCallMessagePartStatus['type'];

const statusIconMap: Record<ToolStatus, React.ElementType> = {
  running: LoopIcon,
  complete: CheckCircleIcon,
  incomplete: CancelIcon,
  'requires-action': ErrorIcon,
};

function ToolFallbackTrigger({
  toolName,
  status,
  className,
  isOpen,
  onClick,
}: {
  toolName: string;
  status?: ToolCallMessagePartStatus;
  className?: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  const classes = useStyles();
  const statusType = status?.type ?? 'complete';
  const isRunning = statusType === 'running';
  const isCancelled =
    status?.type === 'incomplete' && status.reason === 'cancelled';

  const Icon = statusIconMap[statusType];
  const label = isCancelled ? 'Cancelled tool' : 'Used tool';

  return (
    <button
      data-slot="tool-fallback-trigger"
      className={`${classes.trigger} ${className || ''}`}
      onClick={onClick}
      type="button"
    >
      <Icon
        data-slot="tool-fallback-trigger-icon"
        className={`${classes.icon} ${isCancelled ? classes.iconCancelled : ''} ${
          isRunning ? classes.iconRunning : ''
        }`}
      />
      <span
        data-slot="tool-fallback-trigger-label"
        className={`${classes.labelWrapper} ${
          isCancelled ? classes.labelCancelled : ''
        }`}
      >
        <span>
          {label}: <b>{toolName}</b>
        </span>
        {isRunning && (
          <span
            aria-hidden
            data-slot="tool-fallback-trigger-shimmer"
            className={classes.shimmer}
          >
            {label}: <b>{toolName}</b>
          </span>
        )}
      </span>
      <ExpandMoreIcon
        data-slot="tool-fallback-trigger-chevron"
        className={`${classes.chevron} ${
          isOpen ? classes.chevronOpen : classes.chevronClosed
        }`}
      />
    </button>
  );
}

function ToolFallbackContent({
  className,
  children,
  isOpen,
}: {
  className?: string;
  children: React.ReactNode;
  isOpen: boolean;
}) {
  const classes = useStyles();
  return (
    <Collapse
      in={isOpen}
      timeout={ANIMATION_DURATION}
      data-slot="tool-fallback-content"
      className={`${classes.content} ${className || ''}`}
    >
      <div className={classes.contentInner}>{children}</div>
    </Collapse>
  );
}

function ToolFallbackArgs({
  argsText,
  className,
}: {
  argsText?: string;
  className?: string;
}) {
  const classes = useStyles();
  if (!argsText) return null;

  return (
    <div
      data-slot="tool-fallback-args"
      className={`${classes.args} ${className || ''}`}
    >
      <pre className={classes.argsValue}>{argsText}</pre>
    </div>
  );
}

function ToolFallbackResult({
  result,
  className,
}: {
  result?: unknown;
  className?: string;
}) {
  const classes = useStyles();
  if (result === undefined) return null;

  return (
    <div
      data-slot="tool-fallback-result"
      className={`${classes.result} ${className || ''}`}
    >
      <p className={classes.resultHeader}>Result:</p>
      <pre className={classes.resultContent}>
        {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function ToolFallbackError({
  status,
  className,
}: {
  status?: ToolCallMessagePartStatus;
  className?: string;
}) {
  const classes = useStyles();
  if (status?.type !== 'incomplete') return null;

  const error = status.error;
  let errorText: string | null = null;
  if (error) {
    errorText = typeof error === 'string' ? error : JSON.stringify(error);
  }

  if (!errorText) return null;

  const isCancelled = status.reason === 'cancelled';
  const headerText = isCancelled ? 'Cancelled reason:' : 'Error:';

  return (
    <div
      data-slot="tool-fallback-error"
      className={`${classes.error} ${className || ''}`}
    >
      <p className={classes.errorHeader}>{headerText}</p>
      <p className={classes.errorReason}>{errorText}</p>
    </div>
  );
}

const ToolFallbackImpl: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const classes = useStyles();
  const [isOpen, setIsOpen] = useState(false);
  const isCancelled =
    status?.type === 'incomplete' && status.reason === 'cancelled';

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return (
    <ToolFallbackRoot className={isCancelled ? classes.rootCancelled : ''}>
      <ToolFallbackTrigger
        toolName={toolName}
        status={status}
        isOpen={isOpen}
        onClick={handleToggle}
      />
      <ToolFallbackContent isOpen={isOpen}>
        <ToolFallbackError status={status} />
        <ToolFallbackArgs
          argsText={argsText}
          className={isCancelled ? classes.argsCancelled : ''}
        />
        {!isCancelled && <ToolFallbackResult result={result} />}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
};

const ToolFallback = memo(
  ToolFallbackImpl,
) as unknown as ToolCallMessagePartComponent & {
  Root: typeof ToolFallbackRoot;
  Trigger: typeof ToolFallbackTrigger;
  Content: typeof ToolFallbackContent;
  Args: typeof ToolFallbackArgs;
  Result: typeof ToolFallbackResult;
  Error: typeof ToolFallbackError;
};

ToolFallback.displayName = 'ToolFallback';
ToolFallback.Root = ToolFallbackRoot;
ToolFallback.Trigger = ToolFallbackTrigger;
ToolFallback.Content = ToolFallbackContent;
ToolFallback.Args = ToolFallbackArgs;
ToolFallback.Result = ToolFallbackResult;
ToolFallback.Error = ToolFallbackError;

export {
  ToolFallback,
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
};
