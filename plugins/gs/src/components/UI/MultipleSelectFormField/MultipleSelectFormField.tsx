import { ChangeEvent, ReactNode, useId, useState } from 'react';
import {
  Checkbox,
  FormControl,
  FormHelperText,
  Input,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
} from '@material-ui/core';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

type MultipleSelectFormFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  items: string[];
  selectedItems: string[];
  disabledItems?: string[];
  renderValue?: (value: string[]) => ReactNode;
  onChange: (selectedItems: string[]) => void;
};

export const MultipleSelectFormField = ({
  id,
  label,
  required,
  disabled,
  error,
  items,
  helperText,
  selectedItems,
  disabledItems,
  renderValue,
  onChange,
}: MultipleSelectFormFieldProps) => {
  const [localSelectedItems, setLocalSelectedItems] =
    useState<string[]>(selectedItems);

  const handleChange = (
    event: ChangeEvent<{ name?: string; value: unknown }>,
  ) => {
    setLocalSelectedItems(event.target.value as string[]);
  };

  const handleClose = () => {
    if (onChange) {
      onChange(localSelectedItems);
    }
  };

  const labelId = useId();
  const helperId = useId();

  return (
    <FormControl
      fullWidth
      required={required}
      disabled={disabled}
      error={error}
    >
      {label && <InputLabel id={labelId}>{label}</InputLabel>}
      <Select
        id={id}
        labelId={labelId}
        aria-describedby={helperId}
        multiple
        value={localSelectedItems}
        onChange={handleChange}
        onClose={handleClose}
        input={<Input />}
        renderValue={
          renderValue && ((value: unknown) => renderValue(value as string[]))
        }
        MenuProps={MenuProps}
      >
        {items.map(item => (
          <MenuItem
            key={item}
            value={item}
            disabled={disabledItems?.includes(item)}
          >
            <Checkbox checked={localSelectedItems.indexOf(item) > -1} />
            <ListItemText primary={item} />
          </MenuItem>
        ))}
      </Select>
      {helperText && (
        <FormHelperText id={helperId}>{helperText}</FormHelperText>
      )}
    </FormControl>
  );
};
