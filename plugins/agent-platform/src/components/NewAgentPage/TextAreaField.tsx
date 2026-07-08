import { useId, type ChangeEvent } from 'react';
import { FieldLabel } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

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
  } = props;

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
        className={`${classes.textarea} ${mono ? classes.mono : ''}`}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(e.target.value)
        }
      />
    </div>
  );
}
