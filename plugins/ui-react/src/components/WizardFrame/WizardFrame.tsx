import type { ReactNode } from 'react';
import { Button, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import {
  useOwnPageHeader,
  usePageHeaderActionsSlot,
} from '../PageHeaderActions';

const NARROW_BREAKPOINT = 720;

/** The centered column's width per {@link WizardFrameProps.width}. */
const COLUMN_WIDTHS = {
  narrow: 640,
  medium: 760,
  wide: 960,
} as const;

/**
 * How far the footer's top edge can reach into the viewport: its own height
 * (64) plus room for the label above a field, so a field scrolled into view —
 * by the focus moving to it, or by tabbing — never lands under the docked
 * footer (or the shell's mobile bottom bar below it).
 */
const FOOTER_CLEARANCE =
  'calc(96px + var(--agent-shell-mobile-bar-height, 0px))';

const useStyles = makeStyles({
  /**
   * At least the viewport's height (less the shell's mobile bottom bar:
   * `--agent-shell-mobile-bar-height` is 0px on desktop and the bar's height
   * at phone width — agent-shell.css owns it; classic chrome never defines
   * it), so a short form still has its footer at the bottom of the view
   * rather than right under the last field: the action bar sits at one
   * constant position in every flow. `min-height`, not `height`: a long form
   * grows the page, and the sticky footer stays docked while it scrolls.
   */
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 'calc(100dvh - var(--agent-shell-mobile-bar-height, 0px))',
    // JSS puts the fallback first, so browsers without dvh keep vh.
    fallbacks: {
      minHeight: 'calc(100vh - var(--agent-shell-mobile-bar-height, 0px))',
    },
    background: 'var(--bui-bg-app, var(--bui-bg-neutral-1))',
    color: 'var(--bui-fg-primary)',
  },
  header: {
    flex: 'none',
    minHeight: 56,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    padding: '8px 24px',
    borderBottom: '1px solid var(--bui-border-1)',
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      padding: '8px 16px',
    },
  },
  heading: {
    flex: '1 1 0',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  close: {
    width: 34,
    height: 34,
    flex: 'none',
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--bui-fg-secondary)',
    '&:hover': {
      background: 'var(--bui-bg-neutral-2)',
      color: 'var(--bui-fg-primary)',
    },
    '& svg': { width: 18, height: 18 },
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13.5,
    color: 'var(--bui-fg-secondary)',
  },
  stepReached: {
    color: 'var(--bui-fg-primary)',
  },
  stepCurrent: {
    color: 'var(--bui-fg-primary)',
    fontWeight: 500,
  },
  stepLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: 'inherit',
    textDecoration: 'none',
    '&:hover': { textDecoration: 'underline' },
  },
  mark: {
    width: 22,
    height: 22,
    flex: 'none',
    boxSizing: 'border-box',
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 500,
    border: '1px solid var(--bui-border-2)',
    color: 'var(--bui-fg-secondary)',
    '& svg': { width: 14, height: 14 },
  },
  markReached: {
    border: 'none',
    background: 'var(--bui-fg-primary)',
    color: 'var(--bui-bg-app, #ffffff)',
  },
  connector: {
    width: 24,
    height: 1,
    background: 'var(--bui-border-2)',
  },
  spacer: {
    flex: '1 1 0',
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      display: 'none',
    },
  },
  body: {
    flex: '1 1 auto',
  },
  column: {
    boxSizing: 'border-box',
    margin: '0 auto',
    padding: '40px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      padding: '24px 16px',
    },
    '& :is(input, textarea, select, button, [tabindex])': {
      scrollMarginTop: 96,
      scrollMarginBottom: FOOTER_CLEARANCE,
    },
  },
  footer: {
    flex: 'none',
    position: 'sticky',
    // Docked to the viewport's bottom edge — above the shell's fixed bottom
    // bar at phone width, which would otherwise cover it (0px elsewhere).
    bottom: 'var(--agent-shell-mobile-bar-height, 0px)',
    // Above the content that scrolls under it; far below dialogs and popovers.
    zIndex: 2,
    minHeight: 64,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    padding: '12px 24px',
    background: 'var(--bui-bg-app, var(--bui-bg-neutral-1))',
    borderTop: '1px solid var(--bui-border-1)',
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      padding: '12px 16px',
    },
  },
  footerActions: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
});

// The footer's step-provided buttons, in a component of their own so that
// ONLY this leaf re-renders when a step registers actions. The frame renders
// the registering step as its children: if the frame itself consumed the
// value context, every registration would re-render the step, and a step
// passing a fresh element each render would re-register forever.
function StepActions() {
  const actions = usePageHeaderActionsSlot();
  return <>{actions}</>;
}

export interface WizardStep {
  id: string;
  label: string;
  /** Where the step lives; a reached step with one links back to it. */
  href?: string;
}

export interface WizardFrameProps {
  /** What the flow creates, e.g. "New agent": the page's h1. */
  title: string;
  /** Muted text after the title, e.g. "Customize / Models". */
  context?: ReactNode;
  steps?: WizardStep[];
  /** The id of the step on screen. */
  currentStep?: string;
  /** Where Close and Cancel leave to. */
  closeHref: string;
  /** Shows a Back button in the footer. */
  onBack?: () => void;
  /** The centered column's width. The connector wizard's 640px is the default. */
  width?: keyof typeof COLUMN_WIDTHS;
  children: ReactNode;
}

/**
 * A create flow in the page's content area — the shell's rail (or the classic
 * chrome) stays around it: a header row with Close, the title and a step
 * strip, the step's content in a centered column, and a footer with Cancel,
 * Back and the step's own buttons — pinned to the bottom of the view however
 * short the step, and docked there while a long step scrolls behind it.
 *
 * The primary and secondary buttons come from the routed step through
 * `useProvidePageHeaderActions`, so a route above the frame must mount a
 * `PageHeaderActionsProvider`; the frame renders the slot and mounts none,
 * and claims the page header (`useOwnPageHeader`) like `ShellPage`, so a
 * layout header above it stands aside.
 */
export function WizardFrame({
  title,
  context,
  steps,
  currentStep,
  closeHref,
  onBack,
  width = 'narrow',
  children,
}: WizardFrameProps) {
  const classes = useStyles();
  useOwnPageHeader();
  const currentIndex = steps?.findIndex(step => step.id === currentStep) ?? -1;

  return (
    // `data-field-validation-scope`: where useFieldValidation looks for the
    // first invalid field (FIELD_VALIDATION_SCOPE_ATTRIBUTE).
    <div className={classes.root} data-field-validation-scope="">
      <header className={classes.header}>
        <div className={classes.heading}>
          <Link href={closeHref} aria-label="Close" className={classes.close}>
            <CloseIcon />
          </Link>
          <h1 className={classes.title}>{title}</h1>
          {context && (
            <Text variant="body-small" color="secondary">
              {context}
            </Text>
          )}
        </div>
        {steps && steps.length > 0 && (
          <ol aria-label="Steps" className={classes.steps}>
            {steps.map((step, index) => {
              const done = currentIndex >= 0 && index < currentIndex;
              const current = index === currentIndex;
              const label = (
                <>
                  <span
                    aria-hidden
                    className={`${classes.mark} ${
                      done || current ? classes.markReached : ''
                    }`}
                  >
                    {done ? <CheckIcon /> : index + 1}
                  </span>
                  {step.label}
                </>
              );
              return (
                <li
                  key={step.id}
                  className={`${classes.step} ${
                    done ? classes.stepReached : ''
                  } ${current ? classes.stepCurrent : ''}`}
                  aria-current={current ? 'step' : undefined}
                >
                  {done && step.href ? (
                    <Link href={step.href} className={classes.stepLink}>
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                  {index < steps.length - 1 && (
                    <span aria-hidden className={classes.connector} />
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div className={classes.spacer} />
      </header>
      <div className={classes.body}>
        <div
          className={classes.column}
          style={{ maxWidth: COLUMN_WIDTHS[width] }}
        >
          {children}
        </div>
      </div>
      <footer className={classes.footer}>
        <Link href={closeHref} variant="body-medium" color="secondary">
          Cancel
        </Link>
        <div className={classes.footerActions}>
          {onBack && (
            <Button variant="secondary" onPress={onBack}>
              Back
            </Button>
          )}
          <StepActions />
        </div>
      </footer>
    </div>
  );
}
