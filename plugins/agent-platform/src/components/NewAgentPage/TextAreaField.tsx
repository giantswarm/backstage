import { useId, type ChangeEvent } from 'react';
import { FieldLabel } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { characterCount } from '../../lib/systemMessage';
import { formatCount } from '../../lib/formatNumbers';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.75),
  },
  // Matches the bui TextField input (filled, no border) using bui tokens, so
  // these textareas are visually consistent with the Name/Slug fields. bui has
  // no multiline/textarea component, so this is a hand-rolled equivalent.
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
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
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  invalid: {
    outline: `2px solid ${theme.palette.error.main}`,
    outlineOffset: -1,
  },
  counter: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    alignSelf: 'flex-end',
  },
  error: {
    fontSize: '0.75rem',
    color: theme.palette.error.main,
    margin: 0,
  },
}));

export type TextAreaFieldProps = {
  label: string;
  secondaryLabel?: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  /** Shows a live character count against this limit (in code points). */
  maxLength?: number;
  /** Marks the field invalid and says why, right under it. */
  error?: string;
};

export function TextAreaField(props: TextAreaFieldProps) {
  const classes = useStyles();
  const id = useId();
  const {
    label,
    secondaryLabel,
    description,
    value,
    onChange,
    placeholder,
    rows = 4,
    mono = false,
    maxLength,
    error,
  } = props;
  const counterId = `${id}-counter`;
  const errorId = `${id}-error`;
  const describedBy =
    [maxLength !== undefined && counterId, error && errorId]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={classes.root}>
      <FieldLabel
        htmlFor={id}
        label={label}
        secondaryLabel={secondaryLabel}
        description={description}
      />
      <textarea
        id={id}
        className={`${classes.textarea} ${mono ? classes.mono : ''} ${
          error ? classes.invalid : ''
        }`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(e.target.value)
        }
      />
      {error && (
        <p id={errorId} className={classes.error} role="alert">
          {error}
        </p>
      )}
      {maxLength !== undefined && (
        <span id={counterId} className={classes.counter}>
          {formatCount(characterCount(value))} / {formatCount(maxLength)}{' '}
          characters
        </span>
      )}
    </div>
  );
}
