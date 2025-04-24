import { useId } from 'react';
import {
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

type SelectFormFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  items: string[];
  selectedItem: string;
  renderValue?: (value: string) => React.ReactNode;
  onChange?: (selectedItem: string) => void;
};

export const SelectFormField = ({
  id,
  label,
  required,
  disabled,
  error,
  items,
  helperText,
  selectedItem,
  renderValue,
  onChange,
}: SelectFormFieldProps) => {
  const handleChange = (
    event: React.ChangeEvent<{ name?: string; value: unknown }>,
  ) => {
    if (onChange) {
      onChange(event.target.value as string);
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
        value={selectedItem}
        onChange={handleChange}
        input={<Input />}
        renderValue={
          renderValue && ((value: unknown) => renderValue(value as string))
        }
        MenuProps={MenuProps}
      >
        {items.map(item => (
          <MenuItem key={item} value={item}>
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
