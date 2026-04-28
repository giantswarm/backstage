import { memo, useCallback, useRef, useState } from 'react';
import ErrorIcon from '@material-ui/icons/Error';
import CheckIcon from '@material-ui/icons/Check';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import LoopIcon from '@material-ui/icons/Loop';
import HighlightOffIcon from '@material-ui/icons/HighlightOff';
import { Collapse, makeStyles } from '@material-ui/core';
import {
  type ToolCallMessagePartStatus,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import { JsonHighlight } from '@giantswarm/backstage-plugin-ui-react';

const ANIMATION_DURATION = 200;

const SUMMARY_KEYS = [
  'path',
  'file_path',
  'file',
  'command',
  'query',
  'pattern',
  'glob_pattern',
  'search_term',
  'url',
  'description',
  'prompt',
  'name',
  'skill',
  'topic',
  'kind',
];

function toolCallSummary(argsText: string): string | null {
  try {
    const args = JSON.parse(argsText);
    for (const key of SUMMARY_KEYS) {
      const val = args[key];
      if (typeof val === 'string' && val.trim()) {
        const text = val.trim();
        return text.length > 80 ? `${text.slice(0, 77)}...` : text;
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

const useStyles = makeStyles(theme => ({
  root: {
    width: '100%',
  },
  rootCancelled: {
    borderColor: theme.palette.action.disabled,
    backgroundColor: theme.palette.action.hover,
  },
  trigger: {
    display: 'flex',
    gap: theme.spacing(0.75),
    alignItems: 'flex-start',
    fontSize: '0.8125rem',
    lineHeight: 1.4,
    cursor: 'pointer',
    transition: theme.transitions.create('color'),
    color: theme.palette.text.primary,
    border: 'none',
    background: 'none',
    padding: 0,
    textAlign: 'left',
    '&:hover': {
      color: theme.palette.text.secondary,
    },
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
  triggerLabel: {
    position: 'relative',
    display: 'inline-block',
    flexGrow: 1,
    textAlign: 'left',
    fontWeight: 500,
    lineHeight: 1.4,
    minWidth: 0,
  },
  labelCancelled: {
    color: theme.palette.text.disabled,
    textDecoration: 'line-through',
  },
  summary: {
    color: theme.palette.text.secondary,
    fontWeight: 400,
    marginLeft: theme.spacing(1),
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
    width: 14,
    height: 14,
    flexShrink: 0,
    transition: theme.transitions.create('transform', {
      duration: ANIMATION_DURATION,
      easing: theme.transitions.easing.easeOut,
    }),
    marginTop: '2.5px',
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
    fontSize: '0.8125rem',
    borderRadius: 'var(--bui-radius-2)',
    border: `1px solid ${theme.palette.divider}`,
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
    backgroundColor: 'var(--bui-bg-neutral-2)',
    marginTop: theme.spacing(1),
  },
  contentInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  args: {
    paddingTop: 0,
    paddingLeft: theme.spacing(1.5),
    paddingRight: theme.spacing(1.5),
  },
  codeBlock: {
    margin: 0,
    padding: 0,
    fontSize: '0.75rem',
    background: 'none !important',
  },
  result: {
    borderTop: `1px dashed ${theme.palette.divider}`,
    paddingTop: theme.spacing(1),
    paddingLeft: theme.spacing(1.5),
    paddingRight: theme.spacing(1.5),
    '&:first-child': {
      borderTop: 'none',
      paddingTop: 0,
    },
  },
  resultHeader: {
    marginTop: 0,
    marginBottom: theme.spacing(1),
  },
  error: {
    borderTop: `1px dashed ${theme.palette.divider}`,
    paddingTop: theme.spacing(1),
    paddingLeft: theme.spacing(1.5),
    paddingRight: theme.spacing(1.5),
    color: theme.palette.error.main,
    '&:first-child': {
      borderTop: 'none',
      paddingTop: 0,
    },
  },
  errorHeader: {
    fontWeight: 600,
    marginTop: 0,
    marginBottom: theme.spacing(1),
  },
  errorReason: {
    margin: 0,
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
  complete: CheckIcon,
  incomplete: HighlightOffIcon,
  'requires-action': ErrorIcon,
};

function ToolFallbackTrigger({
  toolName,
  argsText,
  status,
  className,
  isOpen,
  onClick,
}: {
  toolName: string;
  argsText?: string;
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
  const showStatusBadge = statusType !== 'complete';

  const StatusIcon = statusIconMap[statusType];
  const summary = argsText && !isOpen ? toolCallSummary(argsText) : null;

  return (
    <button
      data-slot="tool-fallback-trigger"
      className={`${classes.trigger} ${className || ''}`}
      onClick={onClick}
      type="button"
    >
      <ExpandMoreIcon
        data-slot="tool-fallback-trigger-chevron"
        className={`${classes.chevron} ${
          isOpen ? classes.chevronOpen : classes.chevronClosed
        }`}
      />

      <span
        data-slot="tool-fallback-trigger-label"
        className={`${classes.triggerLabel} ${
          isCancelled ? classes.labelCancelled : ''
        }`}
      >
        {showStatusBadge && (
          <StatusIcon
            className={`${classes.statusBadge} ${isRunning ? classes.statusBadgeRunning : ''}`}
          />
        )}
        <span>{toolName}</span>
        {summary && <span className={classes.summary}>{summary}</span>}
      </span>
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
      className={className}
    >
      <div className={classes.content}>
        <div className={classes.contentInner}>{children}</div>
      </div>
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
  if (!argsText || argsText === '{}') return null;

  return (
    <div
      data-slot="tool-fallback-args"
      className={`${classes.args} ${className || ''}`}
    >
      <p className={classes.resultHeader}>Parameters:</p>
      <JsonHighlight
        customStyle={{ margin: 0, padding: 0, background: 'none' }}
        codeTagProps={{ className: classes.codeBlock }}
      >
        {argsText}
      </JsonHighlight>
    </div>
  );
}

/**
 * Recursively walk a value and inline any string that is itself valid JSON
 * (or JSON wrapped in a markdown code fence). This keeps the wrapper structure
 * (e.g. `content`, `isError`) visible while expanding inner text payloads
 * into formatted objects instead of escaped strings.
 */
function inlineJsonStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    let text = value;
    // Strip markdown code fence wrapper if present
    const fenceMatch = text.match(/^```\w*\n([\s\S]*?)\n```$/);
    if (fenceMatch) {
      text = fenceMatch[1];
    }
    try {
      const parsed = JSON.parse(text);
      // Only inline objects/arrays — primitive JSON values are fine as strings
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      /* not JSON, keep as string */
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(inlineJsonStrings);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = inlineJsonStrings(v);
    }
    return out;
  }
  return value;
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

  const expanded = inlineJsonStrings(result);
  const text =
    typeof expanded === 'string' ? expanded : JSON.stringify(expanded, null, 2);

  return (
    <div
      data-slot="tool-fallback-result"
      className={`${classes.result} ${className || ''}`}
    >
      <p className={classes.resultHeader}>Result:</p>
      <JsonHighlight
        customStyle={{ margin: 0, padding: 0, background: 'none' }}
        codeTagProps={{ className: classes.codeBlock }}
      >
        {text}
      </JsonHighlight>
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
        argsText={argsText}
        status={status}
        isOpen={isOpen}
        onClick={handleToggle}
      />
      <ToolFallbackContent isOpen={isOpen}>
        <ToolFallbackArgs
          argsText={argsText}
          className={isCancelled ? classes.argsCancelled : ''}
        />
        <ToolFallbackError status={status} />
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
