import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { makeStyles } from '@material-ui/core';

/**
 * Per-field validation feedback for forms (the `forms` skill): a field is
 * checked when the person leaves it having typed in it, its error then
 * follows each change, and a blocked Continue/Submit shows every field's
 * error and moves the keyboard focus to the first. The field that is wrong
 * says so itself — a danger edge on the input (the shell's
 * `--agent-shell-input-*` rules key on `data-invalid` / `aria-invalid`), the
 * message right under it, tied to it with `aria-describedby`.
 *
 * Four pieces, one mechanism:
 * - {@link useFieldValidation}: which field shows its error when — its
 *   `blurProps`/`textFieldProps`/`fieldProps` go on the fields, `reveal()` on
 *   the blocked button, which also moves the focus.
 * - {@link fieldErrorProps}: the props that make a bui text field
 *   (`TextField`, `SearchField`, `PasswordField`, …) invalid with a message,
 *   through react-aria's own validation, so bui's built-in `FieldError`
 *   renders it.
 * - {@link useSelectFieldError}: the same for a bui `Select`, whose empty
 *   value react-aria never validates.
 * - {@link FieldErrorText}: the message for a hand-rolled field (a textarea or
 *   masked input after a bui `FieldLabel`), which sets `aria-invalid` and
 *   `aria-describedby` itself.
 */

/** Where the focus may land on a field: the control itself, never a wrapper. */
const FOCUSABLE =
  'input:not([type="hidden"]), textarea, select, button, [tabindex]';

function canTakeFocus(element: HTMLElement): boolean {
  return (
    element.matches(FOCUSABLE) &&
    element.tabIndex >= 0 &&
    !element.hasAttribute('disabled') &&
    // react-aria's hidden native <select> mirrors the visible trigger.
    !element.closest('[aria-hidden="true"], [hidden], [inert]')
  );
}

/**
 * Moves the focus to the first invalid field under `root`, in document order:
 * an element marked `aria-invalid="true"` (a hand-rolled field, a react-aria
 * input) or `data-invalid` (a bui field's root, whose control is inside it).
 * Returns whether a field took the focus.
 */
export function focusFirstInvalidField(root: ParentNode = document): boolean {
  const marked = root.querySelectorAll<HTMLElement>(
    '[aria-invalid="true"], [data-invalid]',
  );
  for (const element of Array.from(marked)) {
    const target = canTakeFocus(element)
      ? element
      : Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE)).find(
          canTakeFocus,
        );
    if (target) {
      target.focus();
      return true;
    }
  }
  return false;
}

/** Marks the scope `useFieldValidation` searches when given none. */
export const FIELD_VALIDATION_SCOPE_ATTRIBUTE = 'data-field-validation-scope';

/** What {@link FieldValidation.blurProps} puts on a field or its wrapper. */
export type FieldBlurProps = {
  onFocus: (event: FocusEvent<Element>) => void;
  onBlur: (event: FocusEvent<Element>) => void;
};

export type FieldValidation = {
  /**
   * `problem` while `field` shows it, else `undefined`. A field shows its
   * problem once the person leaves it having typed in it
   * ({@link FieldValidation.blurProps}) or once a submit covered it
   * ({@link FieldValidation.reveal}); from then on the error follows every
   * change, so it clears the moment the value is fixed. Only while the person
   * types into a field that was fine when they entered it does a new problem
   * wait until they leave it.
   */
  errorFor: (field: string, problem: string | undefined) => string | undefined;
  /**
   * Spread onto a field, or a wrapper around a composite one, so leaving it
   * checks it. Leaving marks the field only when its value is non-empty or
   * was typed in, so a required field the person merely tabbed through stays
   * quiet until a submit.
   *
   * Pass the field's current `problem` (as to `errorFor`). The value is read
   * from the text input or textarea that loses the focus; pass `value` for
   * any other control (a selection, a list of inputs).
   */
  blurProps: (
    field: string,
    problem: string | undefined,
    value?: unknown,
  ) => FieldBlurProps;
  /**
   * {@link FieldValidation.blurProps} and the shown error as `error`, for a
   * field component that takes one (`TextAreaField`):
   * `<TextAreaField {...validation.fieldProps('notes', errors.notes)} />`.
   */
  fieldProps: (
    field: string,
    problem: string | undefined,
    value?: unknown,
  ) => FieldBlurProps & { error: string | undefined };
  /**
   * {@link FieldValidation.blurProps} with {@link fieldErrorProps}, for a bui
   * text field (`TextField`, `TextAreaField`, `PasswordField`, …):
   * `<TextField {...validation.textFieldProps('name', errors.name)} />`.
   */
  textFieldProps: (
    field: string,
    problem: string | undefined,
    value?: unknown,
  ) => FieldBlurProps & ReturnType<typeof fieldErrorProps>;
  /**
   * For the blocked button: every field on screen shows its error, and the
   * focus moves to the first invalid one. Keep the button enabled and call
   * this when the form has a problem; never disable the button instead.
   * A field that appears later (a section the person opens after the submit)
   * stays quiet until it is left or the next submit.
   */
  reveal: () => void;
  /** Whether a submit was tried: for a banner of problems no field can show. */
  submitted: boolean;
  /** Counts the blocked attempts; a key for content that must reopen on each. */
  attempt: number;
  /**
   * Back to quiet, as before anything was touched: for a form that stays
   * mounted while closed — a dialog — so it does not reopen with the last
   * attempt's errors showing.
   */
  reset: () => void;
};

/**
 * A value as the blur check compares it: text as is, nothing picked (an empty
 * list, an unticked box) as empty text, anything else as JSON.
 */
function comparable(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === false || (Array.isArray(value) && value.length === 0)) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isFilled(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}

/** The text a focus event's target holds, when it is a text control. */
function textValue(target: EventTarget | null): string | undefined {
  if (target instanceof HTMLTextAreaElement) {
    return target.value;
  }
  if (
    target instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(
      target.type,
    )
  ) {
    return target.value;
  }
  return undefined;
}

/** A field's stay in the focus: its value on entry, and whether it was typed in. */
type Visit = {
  element: Element;
  before: string | undefined;
  typed: boolean;
  stop: () => void;
};

/** Whether the focus moves within `event.currentTarget` (a composite field). */
function staysInside(event: FocusEvent<Element>): boolean {
  const next = event.relatedTarget;
  return next instanceof Node && event.currentTarget.contains(next);
}

/*
 * A pointer press in progress. A blur it causes — a click on Commit right
 * under a field — must not change the layout before the press ends: an error
 * line inserted above the button moves it from under the pointer, and
 * react-aria cancels the press, so the click is lost. Such a blur's check
 * waits until the press, and the click it makes, are over.
 */
let pressing = false;
let afterPress: Array<() => void> = [];
let pressTracked = false;

function endPress() {
  if (!pressing) {
    return;
  }
  pressing = false;
  const pending = afterPress;
  afterPress = [];
  // After the press's own click and press handlers have run.
  window.setTimeout(() => pending.forEach(run => run()), 0);
}

function trackPresses() {
  if (pressTracked || typeof document === 'undefined') {
    return;
  }
  pressTracked = true;
  document.addEventListener(
    'pointerdown',
    () => {
      pressing = true;
    },
    true,
  );
  document.addEventListener('pointerup', endPress, true);
  document.addEventListener('pointercancel', endPress, true);
  // A press whose pointerup never arrived (released outside the window).
  document.addEventListener('keydown', endPress, true);
}

/** Runs `check` now, or once the pointer press in progress is over. */
function whenPressEnds(check: () => void) {
  if (pressing) {
    afterPress.push(check);
  } else {
    check();
  }
}

let liveRegion: HTMLElement | undefined;
let sayTimer: number | undefined;
let clearTimer: number | undefined;

/** How long an announcement stays in the live region before it is emptied. */
const ANNOUNCEMENT_MS = 7000;

/** Empties the live region and drops a pending announcement. */
function clearAnnouncement() {
  window.clearTimeout(sayTimer);
  window.clearTimeout(clearTimer);
  if (liveRegion) {
    liveRegion.textContent = '';
  }
}

/**
 * Says `message` through a polite live region: a field's error that appears
 * when the person leaves it, by which time the focus — and the screen reader —
 * has moved on to the next field.
 */
function announce(message: string) {
  if (typeof document === 'undefined') {
    return;
  }
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('data-field-validation-announcer', '');
    // react-aria's modal dialogs hide everything outside them from screen
    // readers, except a live announcer marked so: a dialog's field errors
    // are announced too.
    liveRegion.setAttribute('data-live-announcer', 'true');
    Object.assign(liveRegion.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(liveRegion);
  }
  // Emptied first, so the same message said twice in a row is said again.
  const region = liveRegion;
  clearAnnouncement();
  sayTimer = window.setTimeout(() => {
    region.textContent = message;
    clearTimer = window.setTimeout(clearAnnouncement, ANNOUNCEMENT_MS);
  }, 50);
}

/**
 * When a form's field errors show — "reward early, punish late", the rules in
 * the `forms` skill (`.claude/skills/forms/SKILL.md`):
 *
 * - a field is checked when the person leaves it having typed something
 *   ({@link FieldValidation.blurProps}), never while they first type;
 * - from then on its error follows each change, so it clears the moment the
 *   value is fixed; a field the person enters while it is fine keeps a new
 *   problem to itself until they leave it;
 * - `reveal()`, for the blocked submit, shows the error of every field on
 *   screen and, once they have rendered, focuses the first invalid field
 *   inside `scope` — by default the closest `WizardFrame` on the page (it
 *   carries {@link FIELD_VALIDATION_SCOPE_ATTRIBUTE}), else the whole
 *   document. A field the reveal itself uncovers (a disclosure the page opens
 *   in the same handler) counts as on screen, and is focusable by then.
 *
 * In a dialog, pass a ref to an element inside the dialog's body as `scope`:
 * the dialog renders in a portal, outside any `WizardFrame`, and the page
 * behind it is not where the person is looking.
 */
export function useFieldValidation(
  scope?: RefObject<HTMLElement>,
): FieldValidation {
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Fields left with a value, or typed in: their errors show from then on.
  const [checked, setChecked] = useState<Readonly<Record<string, true>>>({});
  // The field being typed into that was fine on entry: quiet until left.
  const [quiet, setQuiet] = useState<string>();
  // The commit count at the last blocked submit (see `covers`).
  const [revealedAt, setRevealedAt] = useState<number>();

  // The hook owner's commits, and the commit before which each field first
  // rendered: a submit covers the fields that rendered with it, not those a
  // later change brings in. Field names only, recorded once per field.
  const commits = useRef(0);
  const firstSeen = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    commits.current += 1;
  });

  const visits = useRef(new Map<string, Visit>());
  // Bumped by `reveal()` and `reset()`, so a check waiting for a press to end
  // knows whether the form moved on meanwhile.
  const attempts = useRef(0);
  const generation = useRef(0);

  useEffect(() => trackPresses(), []);

  useEffect(() => {
    if (attempt === 0) {
      return;
    }
    const root =
      scope?.current ??
      document.querySelector(`[${FIELD_VALIDATION_SCOPE_ATTRIBUTE}]`) ??
      document;
    focusFirstInvalidField(root);
  }, [attempt, scope]);

  const covers = useCallback(
    (field: string) => {
      if (!firstSeen.current.has(field)) {
        firstSeen.current.set(field, commits.current);
      }
      return (
        revealedAt !== undefined && firstSeen.current.get(field)! <= revealedAt
      );
    },
    [revealedAt],
  );
  const isChecked = useCallback(
    (field: string) => Boolean(checked[field]) || covers(field),
    [checked, covers],
  );

  const errorFor = useCallback(
    (field: string, problem: string | undefined) => {
      const shows = isChecked(field) && quiet !== field;
      return shows ? problem : undefined;
    },
    [isChecked, quiet],
  );

  const blurProps = useCallback(
    (field: string, problem: string | undefined, value?: unknown) => ({
      onFocus: (event: FocusEvent<Element>) => {
        const current = visits.current.get(field);
        if (current?.element.isConnected) {
          // The focus moving within a composite field.
          return;
        }
        // A visit left behind by a field that unmounted with the focus.
        current?.stop();
        // Typing that ends where it started (a value typed and deleted) is
        // still a change, so the field's input events are watched too.
        const element = event.currentTarget;
        const visit: Visit = {
          element,
          before: comparable(value) ?? textValue(event.target),
          typed: false,
          stop: () => element.removeEventListener('input', onInput),
        };
        function onInput() {
          visit.typed = true;
        }
        element.addEventListener('input', onInput);
        visits.current.set(field, visit);
        if (!problem && isChecked(field)) {
          setQuiet(field);
        }
      },
      onBlur: (event: FocusEvent<Element>) => {
        if (staysInside(event)) {
          return;
        }
        const target = event.target;
        const now = comparable(value) ?? textValue(target);
        const visit = visits.current.get(field);
        visit?.stop();
        visits.current.delete(field);
        const changed = visit ? visit.typed || now !== visit.before : false;
        const wasShown =
          Boolean(problem) && isChecked(field) && quiet !== field;
        const atAttempt = attempts.current;
        const atGeneration = generation.current;
        whenPressEnds(() => {
          // The form closed or was reset meanwhile (a dialog's Cancel).
          if (
            generation.current !== atGeneration ||
            (target instanceof Node && !target.isConnected)
          ) {
            return;
          }
          setQuiet(previous => (previous === field ? undefined : previous));
          if (!isFilled(now) && !changed) {
            return;
          }
          setChecked(previous =>
            previous[field] ? previous : { ...previous, [field]: true },
          );
          // A submit pressed meanwhile focuses the field, which says it.
          if (problem && !wasShown && attempts.current === atAttempt) {
            announce(problem);
          }
        });
      },
    }),
    [isChecked, quiet],
  );

  const fieldProps = useCallback(
    (field: string, problem: string | undefined, value?: unknown) => ({
      ...blurProps(field, problem, value),
      error: errorFor(field, problem),
    }),
    [blurProps, errorFor],
  );

  const textFieldProps = useCallback(
    (field: string, problem: string | undefined, value?: unknown) => ({
      ...blurProps(field, problem, value),
      ...fieldErrorProps(errorFor(field, problem)),
    }),
    [blurProps, errorFor],
  );

  const reveal = useCallback(() => {
    attempts.current += 1;
    setSubmitted(true);
    setQuiet(undefined);
    setRevealedAt(commits.current);
    setAttempt(previous => previous + 1);
  }, []);
  const reset = useCallback(() => {
    generation.current += 1;
    setSubmitted(false);
    setChecked({});
    setQuiet(undefined);
    setRevealedAt(undefined);
    setAttempt(0);
    visits.current.forEach(visit => visit.stop());
    visits.current.clear();
    clearAnnouncement();
  }, []);

  return {
    errorFor,
    blurProps,
    fieldProps,
    textFieldProps,
    reveal,
    submitted,
    attempt,
    reset,
  };
}

/**
 * Makes a bui text field invalid with `error` as its message — or valid
 * without one. Spread onto `TextField`, `SearchField`, `PasswordField`, …;
 * a `Select` takes {@link useSelectFieldError} instead.
 *
 * A bare `isInvalid` would only colour the edge: react-aria's `FieldError`
 * (which every bui field renders under its input) prints the messages of a
 * validation *result*, and a controlled `isInvalid` carries none. A `validate`
 * that returns the message, in `aria` mode (live, no native constraint
 * validation, no `required` attribute), gives the edge, the message under the
 * input, `aria-invalid` and the `aria-describedby` link to it.
 */
export function fieldErrorProps(error: string | undefined): {
  validationBehavior: 'aria';
  validate: () => string | null;
} {
  return {
    validationBehavior: 'aria',
    validate: () => error ?? null,
  };
}

const useStyles = makeStyles(theme => ({
  message: {
    margin: 0,
    fontSize: '0.75rem',
    // The token bui's own FieldError reads (and the agent shell's theme
    // sets), so a hand-rolled field's message matches a bui field's exactly.
    // eslint-disable-next-line @backstage/no-deprecated-bui-tokens
    color: `var(--bui-fg-danger, ${theme.palette.error.main})`,
  },
}));

export type FieldErrorTextProps = {
  /** The id the field's `aria-describedby` points at. */
  id: string;
  children: string;
  /**
   * `alert` for a message that appears while the person types (a length
   * limit), so it is announced without a focus move.
   */
  role?: 'alert';
};

/**
 * The message under a hand-rolled field, styled like bui's `FieldError`. The
 * field itself sets `aria-invalid` and lists `id` in its `aria-describedby`,
 * so the message is read when the field takes the focus.
 */
export function FieldErrorText({ id, children, role }: FieldErrorTextProps) {
  const classes = useStyles();
  return (
    <p id={id} className={classes.message} role={role}>
      {children}
    </p>
  );
}

/**
 * {@link fieldErrorProps} for a bui `Select`: react-aria skips `validate` for
 * an empty selection — the very case a required Select reports — so the
 * Select is marked invalid directly (the danger edge, `data-invalid`) and the
 * message renders as `message`, right under it, which `selectProps` ties to
 * the trigger with `aria-describedby`.
 *
 * @example
 * const installationError = useSelectFieldError(errors.installation);
 * <Select {...installationError.selectProps} … />
 * {installationError.message}
 */
export function useSelectFieldError(error: string | undefined): {
  selectProps: { isInvalid: boolean; 'aria-describedby'?: string };
  message: ReactNode;
} {
  const id = useId();
  const messageId = `${id}-error`;
  return {
    selectProps: {
      isInvalid: Boolean(error),
      'aria-describedby': error ? messageId : undefined,
    },
    message: error ? (
      <FieldErrorText id={messageId}>{error}</FieldErrorText>
    ) : null,
  };
}
