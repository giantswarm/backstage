import {
  useCallback,
  useEffect,
  useId,
  useState,
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

export type FieldValidation = {
  /**
   * Whether errors are shown: false until the first blocked attempt, so a
   * form doesn't shout about empty fields before anyone has done anything.
   */
  shown: boolean;
  /** For the blocked button: show the errors and focus the first invalid field. */
  reveal: () => void;
  /** `message` once errors are shown, else `undefined`. */
  errorFor: (message: string | undefined) => string | undefined;
  /** Counts the blocked attempts; a key for content that must reopen on each. */
  attempt: number;
  /**
   * Back to quiet, as before the first attempt: for a form that stays
   * mounted while closed — a dialog — so it does not reopen with the last
   * attempt's errors showing.
   */
  reset: () => void;
};

/**
 * The show-on-first-attempt state of a form's field errors. `reveal()` shows
 * them and, once they have rendered, focuses the first invalid field inside
 * `scope` — by default the closest `WizardFrame` on the page (it carries
 * {@link FIELD_VALIDATION_SCOPE_ATTRIBUTE}), else the whole document. A field
 * the reveal itself uncovers (a disclosure the page opens in the same handler)
 * is focusable by then, since the focus moves after that render commits.
 *
 * In a dialog, pass a ref to an element inside the dialog's body as `scope`:
 * the dialog renders in a portal, outside any `WizardFrame`, and the page
 * behind it is not where the person is looking.
 */
export function useFieldValidation(
  scope?: RefObject<HTMLElement>,
): FieldValidation {
  const [shown, setShown] = useState(false);
  const [attempt, setAttempt] = useState(0);

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

  const reveal = useCallback(() => {
    setShown(true);
    setAttempt(previous => previous + 1);
  }, []);
  const errorFor = useCallback(
    (message: string | undefined) => (shown ? message : undefined),
    [shown],
  );
  const reset = useCallback(() => {
    setShown(false);
    setAttempt(0);
  }, []);

  return { shown, reveal, errorFor, attempt, reset };
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
