import Box from '@material-ui/core/Box';
import Checkbox from '@material-ui/core/Checkbox';
import FormControl from '@material-ui/core/FormControl';
import { createStyles, makeStyles, Theme } from '@material-ui/core/styles';
import React, { useEffect, useState } from 'react';
import { FormControlLabel, FormGroup, FormLabel } from '@material-ui/core';

const useStyles = makeStyles(
  (theme: Theme) =>
    createStyles({
      formControl: {
        margin: theme.spacing(1, 0),
      },
      label: {
        transform: 'initial',
        fontWeight: 'bold',
        fontSize: theme.typography.body2.fontSize,
        fontFamily: theme.typography.fontFamily,
        color: theme.palette.text.primary,
        '&.Mui-focused': {
          color: theme.palette.text.primary,
        },
      },
      formLabel: {
        transform: 'initial',
        fontWeight: 'bold',
        fontSize: theme.typography.body2.fontSize,
        fontFamily: theme.typography.fontFamily,
        color: theme.palette.text.primary,
        marginBottom: theme.spacing(1.25),
        '&.Mui-focused': {
          color: theme.palette.text.primary,
        },
      },
      formGroup: {
        borderRadius: theme.shape.borderRadius,
        position: 'relative',
        backgroundColor: theme.palette.background.paper,
        border: '1px solid #ced4da',
        fontSize: theme.typography.body1.fontSize,
        padding: theme.spacing(0, 1.5),
        transition: theme.transitions.create(['border-color', 'box-shadow']),
        '&:focus-within': {
          background: theme.palette.background.paper,
          borderRadius: theme.shape.borderRadius,
          borderColor: '#1F5493',
        },
      },
      formControlLabel: {
        root: {
          marginRight: 0,
        },
        label: {
          fontSize: theme.typography.body2.fontSize,
        },
      },
      root: {
        display: 'flex',
        flexDirection: 'column',
      },
    }),
  { name: 'MultipleSelect' },
);

const useFormControlLabelStyles = makeStyles(
  (theme: Theme) =>
    createStyles({
      root: {
        marginRight: 0,
      },
      label: {
        fontSize: theme.typography.body2.fontSize,
      },
    }),
  { name: 'FormControlLabel' },
);

export type SelectItem = {
  label: string;
  value: string;
};

export type SelectedItems = string[];

export type MultipleSelectProps = {
  items: SelectItem[];
  label: string;
  selected?: SelectedItems;
  onChange?: (arg: SelectedItems) => void;
  triggerReset?: boolean;
  disabled?: boolean;
};

export function MultipleSelect(props: MultipleSelectProps) {
  const {
    items,
    label,
    selected,
    onChange,
    triggerReset,
    disabled = false,
  } = props;
  const classes = useStyles();
  const formControlLabelClasses = useFormControlLabelStyles();
  const [value, setValue] = useState<SelectedItems>(selected || []);

  useEffect(() => {
    setValue([]);
  }, [triggerReset]);

  useEffect(() => {
    setValue(selected || []);
  }, [selected]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    checked: boolean,
  ) => {
    const selectedItems = checked
      ? Array.from(new Set([...value, event.target.name]))
      : value.filter(el => el !== event.target.name);

    setValue(selectedItems);
    if (onChange) {
      onChange(selectedItems);
    }
  };

  return (
    <Box className={classes.root}>
      <FormControl className={classes.formControl} component="fieldset">
        <FormLabel className={classes.formLabel} component="legend">
          {label}
        </FormLabel>
        <FormGroup className={classes.formGroup}>
          {items.map(item => (
            <FormControlLabel
              key={item.value}
              classes={formControlLabelClasses}
              control={
                <Checkbox
                  checked={value.includes(item.value)}
                  onChange={handleChange}
                  name={item.value.toString()}
                  disabled={disabled}
                  size="small"
                />
              }
              label={item.label}
            />
          ))}
        </FormGroup>
      </FormControl>
    </Box>
  );
}
