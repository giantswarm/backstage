---
name: forms
description: Rules for form fields and validation — when a field's error shows (on leaving it, live once it is in error, always on submit), enabled submit buttons, focus, accessibility, error wording and server errors — and how to build them with useFieldValidation. Use when building, changing or reviewing a create or edit form, a dialog with inputs, or any field that validates.
---

# Forms and field validation

Load this skill before you build or change a form: a create or edit page, a
wizard step, a dialog with inputs, a typed confirmation. Reviewers of such a
change check it against the [review checklist](#review-checklist) at the end.

Scope today: the agent-platform shell (`plugins/agent-platform`,
`plugins/muster` and the `ui-react` pieces they use) follows these rules.
Other plugins are aligned later; new forms anywhere follow them. Shell-specific
form rules (field styling, "(optional)", `MoreOptions`) stay in the
[`agent-platform-ux-coding`](../agent-platform-ux-coding/SKILL.md) skill.

The rules come from giantswarm/giantswarm#38519.

## 1. When a field's error shows: "reward early, punish late"

| Moment                                      | What happens                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| The person types into a field for the first time | Nothing. No error for a value that is still being typed.                                                 |
| The person leaves the field (blur)          | The field is checked, if they typed in it or it holds a value. Its error, if any, appears under it.          |
| The person merely tabs through an empty field | Nothing. A missing required value is left to the submit, so keyboard users do not leave a trail of red.   |
| The field shows an error and the person edits it | Re-checked on every change: the error clears the moment the value is fixed, or its message follows the value. |
| The fixed field is edited into a new problem | Nothing until they leave it again.                                                                          |
| Submit / Continue / Review                  | Every field is checked, every error shows, the focus moves to the first invalid field.                        |

Re-checking a field in error runs on each change. Debounce (300–500 ms) only a
check that costs something — a request, a parse of a large document; a cheap
synchronous check runs at once, so a fix is rewarded immediately.

Live checks while the person types are allowed only where they guide rather
than punish:

- a character counter near a limit (`TextAreaField`'s `maxLength`; past the
  limit its error appears at once and is announced);
- a rule checklist that ticks off as the value meets each rule (password
  strength style);
- an availability check (a name already taken), debounced 300–500 ms.

A selection — `Select`, radio, checkbox, a card grid — is complete the moment
it is made, so its error may follow the choice at once (unticking the last
zone says "Pick at least one zone."). An empty selection is still left to the
submit.

Cross-field rules (set both endpoints or neither, end after start) are checked
on submit, and from then on follow each change like any shown error.

## 2. Submit

- Keep the submit button enabled. Pressed with a problem, it reveals every
  field's error and moves the focus to the first invalid field; it never sits
  disabled waiting for a valid form.
- A button may be disabled only while its request is in flight, or when it
  cannot run for a reason outside the form's fields (no connection, a dry run
  or fit check that refused, nothing loaded yet); then say why where the
  person sees it: `DisabledAction` (`ui-react`) on the button, or an alert or
  caption beside it that names the reason.
- Never clear what the person typed: not on a failed submit, not on a server
  error, not when a field is hidden and shown again.
- A field inside a fold-out (`MoreOptions`, an accordion) that blocks the
  submit opens it in the same handler that calls `reveal()`, so the error and
  the focus can reach it.
- Each error sits next to its field. A summary box is only for problems no
  field can show (see §5); on a long form an error summary at the top with a
  link to each field is allowed in addition, not instead.
- A wizard validates per step on Continue.

## 3. Prevention first

- Say the format and constraints before the person types: a description
  ("Lowercase letters, numbers and hyphens."), a placeholder with an example
  ("e.g. eu-central-1").
- Use the control that cannot hold an invalid value: a `Select` over a typed
  id, a number field over text, a date picker over a date string.
- Accept flexible input and normalise it: trim whitespace, accept pasted
  values with a trailing newline or a scheme the field can add. Expect pasted
  values and fast keyboard use.

## 4. Accessibility and wording

- An invalid field has `aria-invalid="true"` and its message is tied to it with
  `aria-describedby`. The helpers below do both; a hand-rolled field uses
  `FieldErrorText`.
- An error that appears when the person leaves a field is announced: the focus
  and the screen reader are on the next field by then. `useFieldValidation`
  announces it through a polite live region. An error that appears while
  typing (the counter) uses `role="alert"`.
- Never colour alone: the message is text under the field, next to the danger
  edge.
- Say what is wrong and how to fix it: "Use lowercase letters, digits and
  dashes, e.g. ticket-triage", "Enter an end date after the start date",
  "Type kserve to confirm the removal." Not "Invalid input", not a bare
  "required" — for an empty field, "Enter a name" or "Choose an environment".
  Follow the copy rules of the area (full sentences, no contractions in the
  shell).

## 5. Server-side errors

The server validates again: uniqueness, permissions, business rules, a dry run.

- When the response names a field (a violation's path, a field key), show the
  message on that field, as if it were the field's own problem, and clear it
  when the person changes that field.
- Otherwise show it in a danger `Alert` above the form's actions, titled
  "Could not …", with the server's message as the description.
- Keep the typed input in both cases.

## 6. Building it: `useFieldValidation`

All in `@giantswarm/backstage-plugin-ui-react` (`FieldValidation`). Keep each
field's problem as a plain value computed from the form state on every render;
the hook only decides when it shows.

```tsx
const validation = useFieldValidation(); // in a dialog: useFieldValidation(scopeRef)
const errors = {
  name: name.trim() ? undefined : 'Enter a name',
  region: region ? undefined : 'Choose a region',
};
const regionError = useSelectFieldError(
  validation.errorFor('region', errors.region),
);

<TextField
  label="Name"
  value={name}
  onChange={setName}
  {...validation.textFieldProps('name', errors.name)}
/>
<Select {...regionError.selectProps} … />
{regionError.message}
<TextAreaField
  {...validation.blurProps('notes')}
  error={validation.errorFor('notes', errors.notes)}
  …
/>
<Button
  variant="primary"
  onPress={() => (errors.name || errors.region ? validation.reveal() : submit())}
>
  Continue
</Button>
```

- `errorFor(field, problem)` returns the problem while the field may show it.
  Call it on every render, also while the field is valid: that is how the hook
  learns a field was fixed and goes quiet again.
- `blurProps(field, value?)` goes on the field, or on a wrapper around a
  composite field (focus moving inside the wrapper does not count as leaving).
  It reads the value of a text input or textarea; pass `value` for anything
  else. A selection whose only problem is "nothing picked" needs no
  `blurProps`.
- `textFieldProps(field, problem)` is both, plus `fieldErrorProps`, for a bui
  text field.
- `reveal()` is for the blocked submit. `submitted` is true from the first
  blocked submit on: use it for a banner of problems no field can show.
  `attempt` counts the blocked submits (a `key` to remount a fold-out open).
- `reset()` for a dialog that stays mounted while closed, when it closes.
- A field whose problem is not about what was typed into it (a search box
  whose problem is "pick a result") gets `errorFor` but no `blurProps`.
- Field components that render their own input take `error`, `onFocus` and
  `onBlur` (`TextAreaField`, `SecretTextField`) and pass them through.

Tests (Testing Library): typing alone shows nothing; `userEvent.tab()` out of a
typed field shows the error; tabbing through an empty required field shows
nothing; fixing a shown error clears it at once; a blocked submit shows every
error and focuses the first invalid field.

## 7. Sanctioned exceptions

- Chat composers (the session composer, the new-session composer, the answer
  and approval panel in a session) keep Send disabled while the message is
  empty — there is nothing to send — or past its limit, which their live
  caption says.
- Confirm dialogs without inputs have nothing to validate.
- An edit with nothing changed may keep its save button disabled: no field is
  wrong, there is just nothing to save.

An exception beyond these carries a code comment that names its reason.

## Review checklist

A reviewer of a form change checks:

1. No error shows while a field is first typed in; a field is checked on
   leaving it (`blurProps` / `textFieldProps`), except the live exceptions in
   §1.
2. Tabbing through an empty required field shows nothing.
3. A shown error clears as soon as the value is fixed.
4. The submit button stays enabled and calls `reveal()` on a problem; a
   disabled button has an in-flight request or a stated reason.
5. Each error sits under its field with `aria-invalid` and `aria-describedby`
   (the helpers, or `FieldErrorText`); nothing is colour only.
6. Messages say what is wrong and how to fix it.
7. A server error that names a field shows on that field; the input is kept.
8. Tests cover leaving a field, tabbing through, fixing, and the blocked
   submit.
