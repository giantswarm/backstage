import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import { usePageHeaderActionsSlot } from '../PageHeaderActions';

const NARROW_BREAKPOINT = 720;

const useStyles = makeStyles({
  root: {
    position: 'fixed',
    inset: 0,
    // Above the shell's rail (1000), below MUI dialogs (1300); bui popovers
    // position themselves far above both.
    zIndex: 1200,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bui-bg-app, var(--bui-bg-neutral-1))',
    color: 'var(--bui-fg-primary)',
  },
  header: {
    flex: 'none',
    minHeight: 64,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    padding: '0 24px',
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
    overflowY: 'auto',
  },
  footer: {
    flex: 'none',
    minHeight: 72,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    padding: '12px 24px',
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

export interface WizardStep {
  id: string;
  label: string;
  /** Where the step lives; a reached step with one links back to it. */
  href?: string;
}

export interface FullScreenWizardFrameProps {
  /** What the flow creates, e.g. "New agent": the page's h1. */
  title: string;
  /** Muted text after the title, e.g. "Customize / Models". */
  context?: ReactNode;
  steps?: WizardStep[];
  /** The id of the step on screen. */
  currentStep?: string;
  /** Where Close, Cancel and Escape leave to. */
  closeHref: string;
  /** Shows a Back button in the footer. */
  onBack?: () => void;
  children: ReactNode;
}

function isInsideOverlay(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]') !==
      null
  );
}

/**
 * A create flow covering the whole viewport: a header with Close, the title
 * and a step strip, the step's content, and a footer with Cancel, Back and the
 * step's own buttons.
 *
 * The primary and secondary buttons come from the routed step through
 * `useProvidePageHeaderActions`, so a route above the frame must mount a
 * `PageHeaderActionsProvider`; the frame renders the slot and mounts none.
 * Escape leaves to `closeHref`, except from inside a dialog or menu, which
 * close themselves first.
 */
export function FullScreenWizardFrame({
  title,
  context,
  steps,
  currentStep,
  closeHref,
  onBack,
  children,
}: FullScreenWizardFrameProps) {
  const classes = useStyles();
  const navigate = useNavigate();
  const actions = usePageHeaderActionsSlot();
  const currentIndex = steps?.findIndex(step => step.id === currentStep) ?? -1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        isInsideOverlay(event.target)
      ) {
        return;
      }
      navigate(closeHref);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeHref, navigate]);

  return (
    <div className={classes.root}>
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
      <div className={classes.body}>{children}</div>
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
          {actions}
        </div>
      </footer>
    </div>
  );
}
