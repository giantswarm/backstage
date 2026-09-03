import { useId, type ChangeEvent } from 'react';
import { FieldLabel } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.75),
  },
  // Matches the bui TextField input (filled, no border) using bui tokens —
  // same approach as the create form's TextAreaField. bui's TextField caps
  // `type` at text/email/tel/url, so a masked secret input is hand-rolled.
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: theme.spacing(1, 1.5),
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    borderRadius: theme.shape.borderRadius,
    border: 'none',
    background: 'var(--bui-bg-neutral-2)',
    color: theme.palette.text.primary,
    '&:focus': {
      outline: '2px solid var(--bui-accent-bg)',
      outlineOffset: -1,
    },
    '&::placeholder': {
      color: theme.palette.text.secondary,
    },
    '&:disabled': {
      opacity: 0.5,
    },
  },
}));

export type SecretTextFieldProps = {
  label: string;
  secondaryLabel?: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
};

/** A masked, never-autofilled input for values that must not be shown. */
export function SecretTextField(props: SecretTextFieldProps) {
  const classes = useStyles();
  const id = useId();
  const {
    label,
    secondaryLabel,
    description,
    value,
    onChange,
    placeholder,
    isDisabled = false,
  } = props;

  return (
    <div className={classes.root}>
      <FieldLabel
        htmlFor={id}
        label={label}
        secondaryLabel={secondaryLabel}
        description={description}
      />
      <input
        id={id}
        className={classes.input}
        type="password"
        // Keeps browsers and password managers from treating a provider API
        // key as a login credential to save or to fill in.
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        disabled={isDisabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
      />
    </div>
  );
}
