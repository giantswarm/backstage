import { useId, type ChangeEvent } from 'react';
import { FieldLabel } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.75),
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    padding: theme.spacing(1, 1.25),
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
    '&:focus': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: -1,
      borderColor: 'transparent',
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
