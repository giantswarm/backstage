import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import Collapse from '@material-ui/core/Collapse';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import {
  useAssistantState,
  useMessagePartReasoning,
  type ReasoningMessagePartComponent,
  type ReasoningGroupComponent,
} from '@assistant-ui/react';

const ANIMATION_DURATION = 220;

// How long the reasoning block stays open after the model has finished
// streaming this reasoning step before it auto-collapses to the
// "Thought for Xs" pill. Long enough to read the final lines, short enough
// to feel snappy.
const AUTO_COLLAPSE_DELAY_MS = 800;

// Characters revealed per animation frame while reasoning text is streaming.
// Mirrors StreamingMarkdownText so reasoning visibly types out token-by-token
// even when the SDK delivers several deltas in one React render.
const CHARS_PER_FRAME = 5;

// Animate reasoning that was emitted within this window to handle the case
// where SSE chunks arrive batched (one TCP read -> one React commit).
const NEW_MESSAGE_THRESHOLD_MS = 10_000;

const useReasoningStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      width: '100%',
      margin: theme.spacing(1, 0),
    },
    trigger: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: theme.spacing(0.75),
      padding: 0,
      margin: 0,
      border: 'none',
      background: 'none',
      font: 'inherit',
      color: theme.palette.text.secondary,
      fontSize: '0.8125rem',
      lineHeight: 1.4,
      cursor: 'pointer',
      outline: 'none',
      transition: theme.transitions.create('color'),
      '&:hover': {
        color: theme.palette.text.primary,
      },
      '&:focus-visible': {
        color: theme.palette.text.primary,
        textDecoration: 'underline',
      },
    },
    triggerActive: {
      color: theme.palette.text.primary,
    },
    triggerLabel: {
      position: 'relative',
      display: 'inline-block',
      lineHeight: 1.4,
    },
    triggerShimmer: {
      pointerEvents: 'none',
      position: 'absolute',
      inset: 0,
      backgroundImage:
        theme.palette.type === 'dark'
          ? 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)'
          : 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.45) 50%, transparent 100%)',
      backgroundSize: '200% 100%',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      animation: `$shimmer 2.2s linear infinite`,
    },
    '@keyframes shimmer': {
      '0%': {
        backgroundPosition: '200% 0',
      },
      '100%': {
        backgroundPosition: '-200% 0',
      },
    },
    triggerChevron: {
      width: 14,
      height: 14,
      flexShrink: 0,
      transition: `transform ${ANIMATION_DURATION}ms ease-out`,
      opacity: 0.6,
    },
    triggerChevronClosed: {
      transform: 'rotate(-90deg)',
    },
    triggerChevronOpen: {
      transform: 'rotate(0deg)',
    },
    content: {
      paddingTop: theme.spacing(0.75),
    },
    text: {
      borderLeft: `2px solid ${theme.palette.divider}`,
      paddingLeft: theme.spacing(1.5),
      paddingTop: theme.spacing(0.25),
      paddingBottom: theme.spacing(0.25),
      maxHeight: 240,
      overflowY: 'auto',
      color: theme.palette.text.secondary,
      fontStyle: 'italic',
      fontSize: '0.8125rem',
      lineHeight: 1.55,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      scrollbarWidth: 'thin',
      '&::-webkit-scrollbar': {
        width: 4,
      },
      '&::-webkit-scrollbar-thumb': {
        backgroundColor: theme.palette.divider,
        borderRadius: 2,
      },
    },
    textActive: {
      borderLeftColor: theme.palette.primary.main,
    },
  }),
);

/**
 * Per-part reasoning renderer. Reads the reasoning part text via
 * `useMessagePartReasoning` (only valid inside a reasoning message-part
 * subtree, which is what assistant-ui sets up for us when this is mounted as
 * the `Reasoning` slot in `MessagePrimitive.Parts`). Reveals characters at a
 * steady pace so reasoning visibly types out even when SSE chunks arrive
 * batched, and auto-scrolls the container to keep the latest tokens in view.
 */
const ReasoningImpl: ReasoningMessagePartComponent = () => {
  const classes = useReasoningStyles();
  const { text: targetText, status } = useMessagePartReasoning();

  const isStreaming = status.type === 'running';
  const createdAt = useAssistantState(
    ({ message }) => message.createdAt as Date | undefined,
  );
  const isNewMessage =
    Date.now() - (createdAt?.getTime?.() ?? 0) < NEW_MESSAGE_THRESHOLD_MS;
  const shouldAnimate = isStreaming || isNewMessage;

  const revealedRef = useRef(shouldAnimate ? 0 : targetText.length);
  const [displayedText, setDisplayedText] = useState(() =>
    shouldAnimate ? '' : targetText,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shouldAnimate) {
      revealedRef.current = targetText.length;
      setDisplayedText(targetText);
      return undefined;
    }

    let cancelled = false;
    const tick = () => {
      if (cancelled || revealedRef.current >= targetText.length) return;
      const newLen = Math.min(
        revealedRef.current + CHARS_PER_FRAME,
        targetText.length,
      );
      revealedRef.current = newLen;
      setDisplayedText(targetText.slice(0, newLen));
      if (newLen < targetText.length) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [shouldAnimate, targetText]);

  // Keep the latest tokens in view while streaming. Once the stream ends and
  // the container is scrolled by the user, leave it alone.
  useLayoutEffect(() => {
    if (!isStreaming) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [displayedText, isStreaming]);

  return (
    <div
      ref={containerRef}
      data-slot="reasoning-text"
      className={[classes.text, isStreaming ? classes.textActive : '']
        .filter(Boolean)
        .join(' ')}
      aria-busy={isStreaming}
    >
      {displayedText}
    </div>
  );
};

/**
 * Wraps the per-part reasoning renderers in a collapsible block with a
 * "Thinking 5s..." -> "Thought for 12s" trigger. Auto-opens while the model
 * is reasoning and auto-closes shortly after it moves on, while still letting
 * the user override either way with a click.
 */
const ReasoningGroupImpl: ReasoningGroupComponent = ({
  startIndex,
  endIndex,
  children,
}: {
  startIndex: number;
  endIndex: number;
  children?: ReactNode;
}) => {
  const classes = useReasoningStyles();

  const isReasoningStreaming = useAssistantState(({ message }) => {
    if (message.status?.type !== 'running') return false;
    const lastIndex = message.content.length - 1;
    if (lastIndex < 0) return false;
    const lastType = message.content[lastIndex]?.type;
    if (lastType !== 'reasoning') return false;
    return lastIndex >= startIndex && lastIndex <= endIndex;
  });

  // Track elapsed reasoning time so we can show a live "Thinking 5s..."
  // counter while streaming and a final "Thought for 12s" once the model
  // moves on to a tool call or the answer.
  const startedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);

  useEffect(() => {
    if (isReasoningStreaming) {
      if (startedAtRef.current === null) {
        startedAtRef.current = Date.now();
        setElapsedSeconds(0);
        setFinalDuration(null);
      }
      const interval = window.setInterval(() => {
        if (startedAtRef.current !== null) {
          setElapsedSeconds(
            Math.floor((Date.now() - startedAtRef.current) / 1000),
          );
        }
      }, 250);
      return () => window.clearInterval(interval);
    }

    if (startedAtRef.current !== null) {
      setFinalDuration(
        Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
      );
      startedAtRef.current = null;
    }
    return undefined;
  }, [isReasoningStreaming]);

  // Auto-open while streaming, auto-close shortly after the model moves on.
  // Historical messages (loaded after page reload, etc.) start collapsed so
  // the user isn't blasted with old reasoning when they reopen the chat.
  // A manual click overrides either side and sticks for this group instance.
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const wasEverStreamingRef = useRef(isReasoningStreaming);
  const [isOpen, setIsOpen] = useState(isReasoningStreaming);

  useEffect(() => {
    if (userOverride !== null) {
      setIsOpen(userOverride);
      return undefined;
    }
    if (isReasoningStreaming) {
      wasEverStreamingRef.current = true;
      setIsOpen(true);
      return undefined;
    }
    // Only auto-collapse if we actually saw the stream start in this session;
    // otherwise this is a historical message and the block is already closed.
    if (!wasEverStreamingRef.current) return undefined;
    const timer = window.setTimeout(
      () => setIsOpen(false),
      AUTO_COLLAPSE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isReasoningStreaming, userOverride]);

  const triggerLabel = (() => {
    if (isReasoningStreaming) {
      return elapsedSeconds > 0
        ? `Thinking ${elapsedSeconds}s\u2026`
        : 'Thinking\u2026';
    }
    if (finalDuration && finalDuration > 0) {
      return `Thought for ${finalDuration}s`;
    }
    return 'Reasoning';
  })();

  const handleToggle = () => {
    setUserOverride(prev => {
      const current = prev !== null ? prev : isOpen;
      return !current;
    });
  };

  return (
    <div
      data-slot="reasoning-root"
      data-state={isOpen ? 'open' : 'closed'}
      className={classes.root}
    >
      <button
        type="button"
        data-slot="reasoning-trigger"
        data-state={isOpen ? 'open' : 'closed'}
        onClick={handleToggle}
        className={[
          classes.trigger,
          isReasoningStreaming ? classes.triggerActive : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-expanded={isOpen}
      >
        <ExpandMoreIcon
          className={[
            classes.triggerChevron,
            isOpen ? classes.triggerChevronOpen : classes.triggerChevronClosed,
          ].join(' ')}
        />
        <span className={classes.triggerLabel}>
          <span>{triggerLabel}</span>
          {isReasoningStreaming ? (
            <span aria-hidden className={classes.triggerShimmer}>
              {triggerLabel}
            </span>
          ) : null}
        </span>
      </button>

      <Collapse in={isOpen} timeout={ANIMATION_DURATION}>
        <div className={classes.content} data-slot="reasoning-content">
          {children}
        </div>
      </Collapse>
    </div>
  );
};

const Reasoning = memo(ReasoningImpl) as ReasoningMessagePartComponent;
Reasoning.displayName = 'Reasoning';

const ReasoningGroup = memo(
  ReasoningGroupImpl,
) as unknown as ReasoningGroupComponent;
(ReasoningGroup as { displayName?: string }).displayName = 'ReasoningGroup';

export { Reasoning, ReasoningGroup };
