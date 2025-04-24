import { useId } from 'react';
import {
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
} from '@material-ui/core';

type RadioFormFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  items: string[];
  itemLabels?: string[];
  selectedItem: string;
  renderValue?: (value: string) => React.ReactNode;
  onChange?: (selectedItem: string) => void;
};

export const RadioFormField = ({
  id,
  label,
  required,
  disabled,
  error,
  items,
  itemLabels,
  helperText,
  selectedItem,
  onChange,
}: RadioFormFieldProps) => {
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
      {label && <FormLabel id={labelId}>{label}</FormLabel>}
      <RadioGroup
        id={id}
        aria-describedby={helperId}
        value={selectedItem}
        onChange={handleChange}
      >
        {items.map((item, index) => (
          <FormControlLabel
            key={item}
            value={item}
            control={<Radio color="primary" />}
            label={itemLabels && itemLabels[index] ? itemLabels[index] : item}
          />
        ))}
      </RadioGroup>
      {helperText && (
        <FormHelperText id={helperId}>{helperText}</FormHelperText>
      )}
    </FormControl>
  );
};
