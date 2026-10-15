import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ButtonIcon, Link, Text, VisuallyHidden } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  useOwnPageHeader,
  usePageHeaderActionsSlot,
} from '../PageHeaderActions';
import { ShellDocumentTitle } from '../ShellDocumentTitle';
import {
  PHONE_MEDIA,
  TWO_COLUMN_MEDIA,
  TWO_COLUMN_QUERY,
  useMediaQueryMatch,
  usePhoneLayout,
} from '../../utils/breakpoints';

/** The centered column's width per {@link WizardFrameProps.width}. */
const COLUMN_WIDTHS = {
  narrow: 640,
  medium: 760,
  wide: 960,
} as const;

/**
 * The narrowest the step's column may get beside a docked side panel
 * ({@link useWizardFrameAside}); a frame narrower than the panel plus this
 * cannot dock it, and the panel covers the frame instead.
 */
export const WIZARD_ASIDE_MIN_COLUMN = 400;

/** The width of a step's rail ({@link WizardFrameProps.rail}). */
export const WIZARD_RAIL_WIDTH = 300;

/** The gap between the step's column and its rail. */
const RAIL_GAP = 24;

/** The column's horizontal padding at the two-column tier, both sides. */
const COLUMN_PADDING_X = 64;

/** The rail's distance from the frame's right edge. */
const RAIL_MARGIN_END = 32;

/**
 * The footer's measured height, published on the frame for the clearance, and
 * on the document root while a frame is mounted, for what floats over the page
 * from outside it (the MCP server sign-in notice): it lifts itself by this,
 * so it never lands on Continue or Create.
 */
export const WIZARD_FOOTER_HEIGHT_VAR = '--wizard-footer-height';
const FOOTER_HEIGHT_VAR = WIZARD_FOOTER_HEIGHT_VAR;

/**
 * How far the footer's top edge can reach into the viewport: its own height —
 * measured, since a step's buttons can wrap it to two rows (64px until the
 * first measurement) — plus room for the label above a field, so a field
 * scrolled into view — by the focus moving to it, by tabbing, or by a failed
 * validation focusing it — never lands under the docked footer (or the
 * shell's mobile bottom bar below it).
 */
const FOOTER_CLEARANCE = `calc(var(${FOOTER_HEIGHT_VAR}, 64px) + 32px + var(--agent-shell-mobile-bar-height, 0px))`;

// Phone first: the narrow padding is the default, and the two-column tier
// (≥ 768px, where forms go to two columns) widens it.
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
    boxSizing: 'border-box',
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
    gap: '8px 16px',
    padding: '8px 16px',
    borderBottom: '1px solid var(--bui-border-1)',
    [TWO_COLUMN_MEDIA]: {
      padding: '8px 24px',
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
    // A thumb's target (C25), pulled back by the extra so the title keeps its
    // place against the header's padding.
    [PHONE_MEDIA]: {
      width: 44,
      height: 44,
      margin: -5,
    },
  },
  // The h1 and the context line: one row on a desktop, the title over its
  // context at phone width, where the row would truncate the title to a few
  // letters ("Edit ag…") beside an untruncated "Customize / Agents / <name>".
  titles: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    [PHONE_MEDIA]: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 0,
    },
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    [PHONE_MEDIA]: {
      maxWidth: '100%',
      whiteSpace: 'normal',
      overflowWrap: 'anywhere',
    },
  },
  context: {
    minWidth: 0,
    [PHONE_MEDIA]: {
      maxWidth: '100%',
      overflowWrap: 'anywhere',
    },
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
  // The phone's step strip (C10): "Step 2 of 4 · Skills" over a thin bar, on
  // a row of its own — the four labelled marks wrap to two rows at 375px.
  compactSteps: {
    flex: '1 1 100%',
    paddingBottom: 4,
  },
  compactCurrent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  progress: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    background: 'var(--bui-border-1)',
  },
  progressValue: {
    height: '100%',
    borderRadius: 999,
    background: 'var(--bui-fg-primary)',
  },
  spacer: {
    flex: '1 1 0',
    display: 'none',
    [TWO_COLUMN_MEDIA]: {
      display: 'block',
    },
  },
  body: {
    flex: '1 1 auto',
  },
  // A docked rail: the column and the rail side by side, centred together.
  // Only ever rendered at the two-column tier (`useWizardFrameRail`).
  bodyWithRail: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: RAIL_GAP,
  },
  columnBesideRail: {
    flex: '1 1 auto',
    minWidth: 0,
    margin: 0,
  },
  rail: {
    flex: `0 0 ${WIZARD_RAIL_WIDTH}px`,
    boxSizing: 'border-box',
    position: 'sticky',
    top: 16,
    marginTop: 40,
    marginRight: RAIL_MARGIN_END,
    // Scrolls inside itself rather than running under the docked footer.
    maxHeight: `calc(100vh - 32px - ${FOOTER_CLEARANCE})`,
    overflowY: 'auto',
  },
  column: {
    boxSizing: 'border-box',
    margin: '0 auto',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    [TWO_COLUMN_MEDIA]: {
      padding: '40px 32px',
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
    padding: '12px 16px',
    background: 'var(--bui-bg-app, var(--bui-bg-neutral-1))',
    borderTop: '1px solid var(--bui-border-1)',
    [TWO_COLUMN_MEDIA]: {
      padding: '12px 24px',
    },
  },
  footerActions: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    // One row at 375px: Cancel at the start, Back and the step's buttons
    // taking the rest, end-aligned.
    [PHONE_MEDIA]: {
      flex: '1 1 auto',
      justifyContent: 'flex-end',
      gap: 8,
    },
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

type WizardAsideContextValue = {
  /** The frame's width in px, once measured. */
  frameWidth: number | undefined;
  /** Reserves the frame's right edge for a docked panel; 0 releases it. */
  setAsideWidth: (width: number) => void;
};

const WizardAsideContext = createContext<WizardAsideContextValue | undefined>(
  undefined,
);

/**
 * For a side panel fixed to the viewport's right edge over a
 * {@link WizardFrame} (the create-agent assist chat): reserves `width` px on
 * the frame's right while `active`, so the step and its footer — Continue
 * included — stay beside the panel instead of under it.
 *
 * Answers whether the panel is `docked`: false when the frame is too narrow
 * to keep {@link WIZARD_ASIDE_MIN_COLUMN} px for the step beside it — the
 * panel should then cover the frame as a modal instead — and true outside a
 * frame, or before the frame is measured.
 */
export function useWizardFrameAside(
  width: number,
  active: boolean,
): { docked: boolean } {
  const context = useContext(WizardAsideContext);
  const frameWidth = context?.frameWidth;
  const docked =
    frameWidth === undefined || frameWidth - width >= WIZARD_ASIDE_MIN_COLUMN;
  const setAsideWidth = context?.setAsideWidth;
  const reserve = active && docked ? width : 0;
  useEffect(() => {
    if (!setAsideWidth || reserve === 0) {
      return undefined;
    }
    setAsideWidth(reserve);
    return () => setAsideWidth(0);
  }, [setAsideWidth, reserve]);
  return { docked };
}

const WizardRailContext = createContext(false);

/**
 * For a step that passes a {@link WizardFrameProps.rail}: whether the frame
 * docks it beside the step. When it does not — below the two-column tier, or
 * in a frame too narrow to keep {@link WIZARD_ASIDE_MIN_COLUMN} px for the step
 * beside it — the rail is not rendered, and the step shows its narrow fallback
 * instead. False outside a frame.
 */
export function useWizardFrameRail(): { docked: boolean } {
  return { docked: useContext(WizardRailContext) };
}

/**
 * Measures the frame (for a docked side panel) and its footer (for the scroll
 * clearance), publishing the footer's height as a CSS variable on the frame.
 */
function useFrameMeasurements() {
  const rootRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [frameWidth, setFrameWidth] = useState<number>();

  useEffect(() => {
    const root = rootRef.current;
    const footer = footerRef.current;
    if (!root || !footer) {
      return undefined;
    }
    const documentRoot = document.documentElement;
    const measure = () => {
      // The border box: a reserved aside is padding on the frame, and must
      // not shrink the width it is measured against.
      const width = root.getBoundingClientRect().width;
      if (width > 0) {
        setFrameWidth(Math.round(width));
      }
      const height = footer.getBoundingClientRect().height;
      if (height > 0) {
        const value = `${Math.ceil(height)}px`;
        root.style.setProperty(FOOTER_HEIGHT_VAR, value);
        documentRoot.style.setProperty(FOOTER_HEIGHT_VAR, value);
      }
    };
    // At once as well: the floating notice clears the footer from the first
    // paint, not from the observer's first callback.
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(root);
    observer?.observe(footer);
    return () => {
      observer?.disconnect();
      // No frame, no footer: the notice goes back to the corner.
      documentRoot.style.removeProperty(FOOTER_HEIGHT_VAR);
    };
  }, []);

  return { rootRef, footerRef, frameWidth };
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
  /**
   * The document title's parts, most specific first; the suffix from
   * `ShellDocumentTitleProvider` follows. Defaults to the title.
   */
  documentTitle?: ReadonlyArray<string | undefined>;
  /** Muted text after the title, e.g. "Customize / Models". */
  context?: ReactNode;
  steps?: WizardStep[];
  /** The id of the step on screen. */
  currentStep?: string;
  /** Where Close and Cancel leave to. */
  closeHref: string;
  /**
   * The flow holds input that leaving would lose: Close and Cancel then ask
   * first, in one dialog ("Discard changes" / "Keep editing"), and a reload or
   * a closed tab asks through the browser's own prompt. Off by default, and
   * while nothing was entered — an untouched flow leaves at once. The step
   * strip's links do not ask: they stay inside the flow, whose state lives
   * above its steps. In-app navigation elsewhere — the shell's nav and rail,
   * the command palette, the browser's Back — is not intercepted, because the
   * app's router has no navigation blocker.
   */
  confirmDiscard?: boolean;
  /** Shows a Back button in the footer. */
  onBack?: () => void;
  /** The centered column's width. The connector wizard's 640px is the default. */
  width?: keyof typeof COLUMN_WIDTHS;
  /**
   * A sticky panel to the right of the step's column — an overview of what
   * the step has chosen so far. Docked only at the two-column tier with room
   * to spare ({@link useWizardFrameRail}); otherwise not rendered, and the step
   * renders its own narrow fallback.
   */
  rail?: ReactNode;
  children: ReactNode;
}

/**
 * A create flow in the page's content area — the shell's rail (or the classic
 * chrome) stays around it: a header row with Close, the title and a step
 * strip, the step's content in a centered column, and a footer with Cancel,
 * Back and the step's own buttons — pinned to the bottom of the view however
 * short the step, and docked there while a long step scrolls behind it.
 *
 * At phone width the title goes over its context line, the step strip becomes
 * "Step 2 of 4 · Skills" over a progress bar (the labelled list stays for
 * assistive technology), Close is a thumb-sized target and Back an icon, so
 * the footer keeps to one row.
 *
 * The primary and secondary buttons come from the routed step through
 * `useProvidePageHeaderActions`, so a route above the frame must mount a
 * `PageHeaderActionsProvider`; the frame renders the slot and mounts none,
 * and claims the page header (`useOwnPageHeader`) like `ShellPage`, so a
 * layout header above it stands aside. It sets the document title too.
 */
export function WizardFrame({
  title,
  documentTitle,
  context,
  steps,
  currentStep,
  closeHref,
  confirmDiscard = false,
  onBack,
  width = 'narrow',
  rail,
  children,
}: WizardFrameProps) {
  const classes = useStyles();
  useOwnPageHeader();
  const navigate = useNavigate();
  const [isDiscardOpen, setDiscardOpen] = useState(false);
  // Close and Cancel stay links — a modified click still opens the target in
  // a new tab, which loses nothing — and a plain click with input to lose
  // asks first. Preventing the default also stops the client-side routing.
  const onLeave = useCallback(
    (event: MouseEvent<Element>) => {
      if (
        !confirmDiscard ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      setDiscardOpen(true);
    },
    [confirmDiscard],
  );
  // A reload or a closed tab would lose the input too; the browser asks with
  // its own standard prompt (its text cannot be set). Client-side navigation
  // does not unload the page, so neither the step strip nor a save's redirect
  // triggers it. In-app navigation away (the shell's nav and rail, the palette,
  // Back) would need a router blocker, which the app does not have.
  useEffect(() => {
    if (!confirmDiscard) {
      return undefined;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Still required by some browsers to show the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [confirmDiscard]);
  const isPhone = usePhoneLayout();
  const isTwoColumn = useMediaQueryMatch(TWO_COLUMN_QUERY);
  const { rootRef, footerRef, frameWidth } = useFrameMeasurements();
  const [asideWidth, setAsideWidth] = useState(0);
  const aside = useMemo(
    () => ({ frameWidth, setAsideWidth }),
    [frameWidth, setAsideWidth],
  );
  // Docked while the step keeps its minimum column beside it (and beside a
  // docked side panel's reservation); assumed to fit until measured.
  const railDocked =
    Boolean(rail) &&
    isTwoColumn &&
    (frameWidth === undefined ||
      frameWidth -
        asideWidth -
        WIZARD_RAIL_WIDTH -
        RAIL_GAP -
        COLUMN_PADDING_X -
        RAIL_MARGIN_END >=
        WIZARD_ASIDE_MIN_COLUMN);
  const currentIndex = steps?.findIndex(step => step.id === currentStep) ?? -1;

  const stepList = steps && steps.length > 0 && (
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
            className={`${classes.step} ${done ? classes.stepReached : ''} ${
              current ? classes.stepCurrent : ''
            }`}
            aria-current={current ? 'step' : undefined}
          >
            {/* No links in the phone's hidden list: a focusable element no
                one can see. Back in the footer goes back there. */}
            {done && step.href && !isPhone ? (
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
  );

  let stepStrip: ReactNode = stepList;
  if (stepList && isPhone) {
    const current = currentIndex >= 0 ? steps![currentIndex] : undefined;
    stepStrip = (
      <div className={classes.compactSteps}>
        {current && (
          // The list below says the same to assistive technology.
          <div aria-hidden className={classes.compactCurrent}>
            <Text variant="body-small" color="secondary">
              Step {currentIndex + 1} of {steps!.length} · {current.label}
            </Text>
            <div className={classes.progress}>
              <div
                className={classes.progressValue}
                style={{
                  width: `${((currentIndex + 1) / steps!.length) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
        <VisuallyHidden>{stepList}</VisuallyHidden>
      </div>
    );
  }

  return (
    <WizardAsideContext.Provider value={aside}>
      <ShellDocumentTitle title={documentTitle ?? title} />
      {/* `data-field-validation-scope`: where useFieldValidation looks for the
          first invalid field (FIELD_VALIDATION_SCOPE_ATTRIBUTE). */}
      <div
        ref={rootRef}
        className={classes.root}
        data-field-validation-scope=""
        style={asideWidth > 0 ? { paddingRight: asideWidth } : undefined}
      >
        <header className={classes.header}>
          <div className={classes.heading}>
            <Link
              href={closeHref}
              aria-label="Close"
              className={classes.close}
              onClick={onLeave}
            >
              <CloseIcon />
            </Link>
            <div className={classes.titles}>
              <h1 className={classes.title}>{title}</h1>
              {context && (
                <Text
                  variant="body-small"
                  color="secondary"
                  className={classes.context}
                >
                  {context}
                </Text>
              )}
            </div>
          </div>
          {stepStrip}
          <div className={classes.spacer} />
        </header>
        <WizardRailContext.Provider value={railDocked}>
          <div
            className={`${classes.body} ${
              railDocked ? classes.bodyWithRail : ''
            }`}
          >
            <div
              className={`${classes.column} ${
                railDocked ? classes.columnBesideRail : ''
              }`}
              style={{ maxWidth: COLUMN_WIDTHS[width] }}
            >
              {children}
            </div>
            {railDocked && <div className={classes.rail}>{rail}</div>}
          </div>
        </WizardRailContext.Provider>
        <footer ref={footerRef} className={classes.footer}>
          <Link
            href={closeHref}
            variant="body-medium"
            color="secondary"
            onClick={onLeave}
          >
            Cancel
          </Link>
          <div className={classes.footerActions}>
            {onBack &&
              (isPhone ? (
                <ButtonIcon
                  variant="secondary"
                  icon={<ArrowBackIcon />}
                  aria-label="Back"
                  onPress={onBack}
                />
              ) : (
                <Button variant="secondary" onPress={onBack}>
                  Back
                </Button>
              ))}
            <StepActions />
          </div>
        </footer>
      </div>
      <ConfirmDialog
        isOpen={isDiscardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard your changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDiscardOpen(false);
          navigate(closeHref);
        }}
      >
        <Text variant="body-medium">What you entered will not be saved.</Text>
      </ConfirmDialog>
    </WizardAsideContext.Provider>
  );
}
