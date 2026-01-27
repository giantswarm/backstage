import { memo, useRef, useState } from 'react';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import Collapse from '@material-ui/core/Collapse';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import {
  useAssistantState,
  type ReasoningMessagePartComponent,
  type ReasoningGroupComponent,
} from '@assistant-ui/react';
import { MarkdownText } from './MarkdownText';

const ANIMATION_DURATION = 200;

const useReasoningStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      marginBottom: theme.spacing(2),
      width: '100%',
    },
    rootOutline: {
      borderRadius: theme.spacing(1),
      border: `1px solid ${theme.palette.divider}`,
      paddingTop: theme.spacing(1.5),
      paddingBottom: theme.spacing(1.5),
    },
    rootMuted: {
      borderRadius: theme.spacing(1),
      border: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.action.hover,
      paddingTop: theme.spacing(1.5),
      paddingBottom: theme.spacing(1.5),
    },
    trigger: {
      display: 'flex',
      maxWidth: '75%',
      alignItems: 'center',
      gap: theme.spacing(1),
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(2),
      color: theme.palette.text.secondary,
      fontSize: '0.875rem',
      transition: theme.transitions.create('color'),
      cursor: 'pointer',
      border: 'none',
      background: 'none',
      font: 'inherit',
      outline: 'inherit',
      '&:hover': {
        color: theme.palette.text.primary,
      },
    },
    triggerIcon: {
      width: 16,
      height: 16,
      flexShrink: 0,
    },
    triggerLabelWrapper: {
      position: 'relative',
      display: 'inline-block',
      lineHeight: 1,
    },
    triggerShimmer: {
      pointerEvents: 'none',
      position: 'absolute',
      inset: 0,
      animation: `$shimmer 2s linear infinite`,
      background:
        'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)',
      backgroundSize: '200% 100%',
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
      marginTop: 2,
      width: 16,
      height: 16,
      flexShrink: 0,
      transition: `transform ${ANIMATION_DURATION}ms ease-out`,
    },
    triggerChevronClosed: {
      transform: 'rotate(-90deg)',
    },
    triggerChevronOpen: {
      transform: 'rotate(0deg)',
    },
    content: {
      position: 'relative',
      overflow: 'hidden',
      color: theme.palette.text.secondary,
      fontSize: '0.875rem',
      outline: 'none',
    },
    text: {
      position: 'relative',
      zIndex: 0,
      maxHeight: 256,
      overflowY: 'auto',
      paddingTop: theme.spacing(1),
      paddingBottom: theme.spacing(1),
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(2),
      lineHeight: 1.6,
    },
    fade: {
      pointerEvents: 'none',
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10,
      height: 32,
      background:
        theme.palette.type === 'dark'
          ? 'linear-gradient(to top, rgba(18, 18, 18, 1), transparent)'
          : 'linear-gradient(to top, rgba(255, 255, 255, 1), transparent)',
    },
    fadeMuted: {
      background:
        theme.palette.type === 'dark'
          ? 'linear-gradient(to top, rgba(255, 255, 255, 0.05), transparent)'
          : 'linear-gradient(to top, rgba(0, 0, 0, 0.03), transparent)',
    },
  }),
);

export type ReasoningRootProps = {
  className?: string;
  variant?: 'default' | 'outline' | 'muted';
  open?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
};

function ReasoningRoot({
  className,
  variant = 'default',
  open,
  defaultOpen = false,
  children,
}: ReasoningRootProps) {
  const classes = useReasoningStyles();
  const collapsibleRef = useRef<HTMLDivElement>(null);

  const isOpen = open ?? defaultOpen;

  const rootClasses = [
    classes.root,
    variant === 'outline' && classes.rootOutline,
    variant === 'muted' && classes.rootMuted,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={collapsibleRef}
      data-slot="reasoning-root"
      data-variant={variant}
      data-state={isOpen ? 'open' : 'closed'}
      className={rootClasses}
      style={
        {
          '--animation-duration': `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

function ReasoningFade({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & {
  variant?: 'default' | 'outline' | 'muted';
}) {
  const classes = useReasoningStyles();

  return (
    <div
      data-slot="reasoning-fade"
      className={[
        classes.fade,
        variant === 'muted' && classes.fadeMuted,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}

function ReasoningTrigger({
  active,
  duration,
  className,
  onClick,
  isOpen,
  ...props
}: {
  active?: boolean;
  duration?: number;
  className?: string;
  onClick?: () => void;
  isOpen?: boolean;
}) {
  const classes = useReasoningStyles();
  const durationText = duration ? ` (${duration}s)` : '';

  return (
    <button
      type="button"
      data-slot="reasoning-trigger"
      data-state={isOpen ? 'open' : 'closed'}
      className={[classes.trigger, className].filter(Boolean).join(' ')}
      onClick={onClick}
      {...props}
    >
      <AutorenewIcon
        data-slot="reasoning-trigger-icon"
        className={classes.triggerIcon}
      />
      <span
        data-slot="reasoning-trigger-label"
        className={classes.triggerLabelWrapper}
      >
        <span>Reasoning{durationText}</span>
        {active ? (
          <span
            aria-hidden
            data-slot="reasoning-trigger-shimmer"
            className={classes.triggerShimmer}
          >
            Reasoning{durationText}
          </span>
        ) : null}
      </span>
      <ExpandMoreIcon
        data-slot="reasoning-trigger-chevron"
        className={[
          classes.triggerChevron,
          isOpen ? classes.triggerChevronOpen : classes.triggerChevronClosed,
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </button>
  );
}

function ReasoningContent({
  className,
  children,
  isOpen,
  variant,
  ...props
}: {
  className?: string;
  children?: React.ReactNode;
  isOpen?: boolean;
  variant?: 'default' | 'outline' | 'muted';
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  const classes = useReasoningStyles();

  return (
    <Collapse
      in={isOpen}
      timeout={ANIMATION_DURATION}
      className={[classes.content, className].filter(Boolean).join(' ')}
    >
      <div
        data-slot="reasoning-content"
        data-state={isOpen ? 'open' : 'closed'}
        {...props}
      >
        {children}
      </div>
    </Collapse>
  );
}

function ReasoningText({ className, ...props }: React.ComponentProps<'div'>) {
  const classes = useReasoningStyles();

  return (
    <div
      data-slot="reasoning-text"
      className={[classes.text, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

const ReasoningImpl: ReasoningMessagePartComponent = () => <MarkdownText />;

const ReasoningGroupImpl: ReasoningGroupComponent = ({
  children,
  startIndex,
  endIndex,
}) => {
  const isReasoningStreaming = useAssistantState(({ message }) => {
    if (message.status?.type !== 'running') return false;
    const lastIndex = message.content.length - 1;
    if (lastIndex < 0) return false;
    const lastType = message.content[lastIndex]?.type;
    if (lastType !== 'reasoning') return false;
    return lastIndex >= startIndex && lastIndex <= endIndex;
  });

  const [isOpen, setIsOpen] = useState(false);

  const variant = 'muted';

  return (
    <ReasoningRoot variant={variant} open={isOpen}>
      <ReasoningTrigger
        active={isReasoningStreaming}
        onClick={() => setIsOpen(!isOpen)}
        isOpen={isOpen}
      />
      <ReasoningContent
        aria-busy={isReasoningStreaming}
        isOpen={isOpen}
        variant={variant}
      >
        <ReasoningText>{children}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
};

const Reasoning = memo(
  ReasoningImpl,
) as unknown as ReasoningMessagePartComponent & {
  Root: typeof ReasoningRoot;
  Trigger: typeof ReasoningTrigger;
  Content: typeof ReasoningContent;
  Text: typeof ReasoningText;
  Fade: typeof ReasoningFade;
};

Reasoning.displayName = 'Reasoning';
Reasoning.Root = ReasoningRoot;
Reasoning.Trigger = ReasoningTrigger;
Reasoning.Content = ReasoningContent;
Reasoning.Text = ReasoningText;
Reasoning.Fade = ReasoningFade;

const ReasoningGroup = memo(ReasoningGroupImpl);
ReasoningGroup.displayName = 'ReasoningGroup';

export { Reasoning, ReasoningGroup };
