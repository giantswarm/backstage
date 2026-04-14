/**
 * Input props that prevent password manager browser extensions
 * from attaching autofill triggers to a text field.
 *
 * Usage with MUI TextField:
 * ```tsx
 * <TextField inputProps={passwordManagerIgnoreProps} />
 * ```
 */
export const passwordManagerIgnoreProps: React.InputHTMLAttributes<HTMLInputElement> &
  Record<string, unknown> = {
  autoComplete: 'off',
  'data-1p-ignore': true, // 1Password
  'data-lpignore': 'true', // LastPass
  'data-bwignore': true, // Bitwarden
  'data-protonpass-ignore': true, // Proton Pass
  'data-form-type': 'other', // Dashlane
};
