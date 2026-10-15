import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { makeStyles } from '@material-ui/core';

/**
 * Per-field validation feedback for the create flows: when a Continue/Submit
 * is blocked, the field that is wrong says so itself — a danger edge on the
 * input (the shell's `--agent-shell-input-*` rules key on `data-invalid` /
 * `aria-invalid`), the message right under it, tied to it with
 * `aria-describedby` — and the keyboard focus moves to the first such field.
 *
 * Three pieces, one mechanism:
 * - {@link useFieldValidation}: whether errors are shown yet, and `reveal()`
 *   for the blocked button, which also moves the focus.
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
   * `message` while `field` may show its error, else `undefined`. A field
   * may show it once the person leaves it ({@link FieldValidation.blurProps})
   * or tries to submit ({@link FieldValidation.reveal}); from then on the
   * error follows every change, and it goes quiet again the moment the value
   * is fixed, so a field the person is fixing never scolds them for a value
   * they are still typing.
   *
   * Call it on every render with the field's current problem, also while it
   * is valid: that is how the hook learns the field was fixed.
   */
  errorFor: (field: string, message: string | undefined) => string | undefined;
  /**
   * Spread onto a text field (or a wrapper around a composite one) so leaving
   * it checks it. Leaving marks the field only when its value is non-empty or
   * changed while it had the focus, so a required field the person merely
   * tabbed through stays quiet until a submit.
   *
   * The value is read from a text input or textarea that loses the focus;
   * pass `value` for any other control (a selection, a list of inputs).
   */
  blurProps: (field: string, value?: unknown) => FieldBlurProps;
  /**
   * Both of the above for a bui text field (`TextField`, `TextAreaField`,
   * `PasswordField`, …), with {@link fieldErrorProps}:
   * `<TextField {...validation.textFieldProps('name', errors.name)} />`.
   */
  textFieldProps: (
    field: string,
    message: string | undefined,
  ) => FieldBlurProps & ReturnType<typeof fieldErrorProps>;
  /**
   * For the blocked button: every field may show its error, and the focus
   * moves to the first invalid one. Keep the button enabled and call this
   * when the form has a problem; never disable the button instead.
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
  before: string | undefined;
  typed: boolean;
  stop: () => void;
};

/** Whether the focus moves within `event.currentTarget` (a composite field). */
function staysInside(event: FocusEvent<Element>): boolean {
  const next = event.relatedTarget;
  return next instanceof Node && event.currentTarget.contains(next);
}

let liveRegion: HTMLElement | undefined;

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
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 50);
}

/**
 * When a form's field errors show — "reward early, punish late", the rules in
 * the `forms` skill (`.claude/skills/forms/SKILL.md`):
 *
 * - a field is checked when the person leaves it having typed something
 *   ({@link FieldValidation.blurProps}), never while they first type;
 * - once it shows an error, the error follows each change and clears the
 *   moment the value is fixed;
 * - `reveal()`, for the blocked submit, shows every field's error and, once
 *   they have rendered, focuses the first invalid field inside `scope` — by
 *   default the closest `WizardFrame` on the page (it carries
 *   {@link FIELD_VALIDATION_SCOPE_ATTRIBUTE}), else the whole document. A
 *   field the reveal itself uncovers (a disclosure the page opens in the same
 *   handler) is focusable by then, since the focus moves after that render
 *   commits.
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
  // Per field: whether its error may show. A field without an entry follows
  // `submitted`.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // Each field's problem as last rendered, and the visit of the field that
  // has the focus — refs, since neither should re-render the form.
  const problems = useRef(new Map<string, string | undefined>());
  const visits = useRef(new Map<string, Visit>());

  const isChecked = useCallback(
    (field: string) => checked[field] ?? submitted,
    [checked, submitted],
  );

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

  // A checked field whose value is now fine goes quiet again, so a new
  // problem the person types into it waits until they leave it. After every
  // render, since the problems arrive through `errorFor` during it; it sets
  // state only for a checked, valid field, which that unchecks, so it settles
  // in one pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fixed = Array.from(problems.current)
      .filter(([field, problem]) => !problem && isChecked(field))
      .map(([field]) => field);
    if (fixed.length > 0) {
      setChecked(previous => {
        const next = { ...previous };
        for (const field of fixed) {
          next[field] = false;
        }
        return next;
      });
    }
  });

  const errorFor = useCallback(
    (field: string, message: string | undefined) => {
      problems.current.set(field, message);
      return isChecked(field) ? message : undefined;
    },
    [isChecked],
  );

  const blurProps = useCallback(
    (field: string, value?: unknown): FieldBlurProps => ({
      onFocus: event => {
        if (visits.current.has(field)) {
          return;
        }
        // Typing that ends where it started (a value typed and deleted) is
        // still a change, so the field's input events are watched too.
        const element = event.currentTarget;
        const visit: Visit = {
          before: comparable(value) ?? textValue(event.target),
          typed: false,
          stop: () => element.removeEventListener('input', onInput),
        };
        function onInput() {
          visit.typed = true;
        }
        element.addEventListener('input', onInput);
        visits.current.set(field, visit);
      },
      onBlur: event => {
        if (staysInside(event)) {
          return;
        }
        const now = comparable(value) ?? textValue(event.target);
        const visit = visits.current.get(field);
        visit?.stop();
        visits.current.delete(field);
        const changed = visit ? visit.typed || now !== visit.before : false;
        if (!isFilled(now) && !changed) {
          return;
        }
        const problem = problems.current.get(field);
        if (problem && !isChecked(field)) {
          announce(problem);
        }
        setChecked(previous =>
          previous[field] ? previous : { ...previous, [field]: true },
        );
      },
    }),
    [isChecked],
  );

  const textFieldProps = useCallback(
    (field: string, message: string | undefined) => ({
      ...blurProps(field),
      ...fieldErrorProps(errorFor(field, message)),
    }),
    [blurProps, errorFor],
  );

  const reveal = useCallback(() => {
    setSubmitted(true);
    setChecked({});
    setAttempt(previous => previous + 1);
  }, []);
  const reset = useCallback(() => {
    setSubmitted(false);
    setChecked({});
    setAttempt(0);
    visits.current.forEach(visit => visit.stop());
    visits.current.clear();
  }, []);

  return {
    errorFor,
    blurProps,
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
