import React, { useMemo } from 'react';
import { CatalogAutocomplete } from '@backstage/plugin-catalog-react';
import { AutocompleteOption } from './AutocompleteOption';

type AutocompleteProps = {
  items: {
    label: string;
    value: string;
  }[];
  label: string;
  selectedValues?: string[];
  onChange?: (selected: string[]) => void;
  disabled?: boolean;
};

export const Autocomplete = ({
  items,
  label,
  selectedValues,
  onChange,
  disabled = false,
}: AutocompleteProps) => {
  const value = useMemo(() => {
    if (!selectedValues) {
      return undefined;
    }

    return selectedValues
      .map(selectedValue => items.find(item => item.value === selectedValue))
      .filter(Boolean) as {
      label: string;
      value: string;
    }[];
  }, [items, selectedValues]);

  return (
    <CatalogAutocomplete<
      {
        label: string;
        value: string;
      },
      true
    >
      multiple
      disableCloseOnSelect
      label={label}
      name={`${label.toLowerCase().replace(/\s/g, '-')}-autocomplete`}
      options={items}
      getOptionLabel={option => option.label}
      value={value}
      disabled={disabled}
      onChange={(_event, selectedItems) => {
        const newValues = selectedItems.map(selectedItem => selectedItem.value);
        if (onChange) {
          onChange(newValues);
        }
      }}
      renderOption={(option, { selected }) => (
        <AutocompleteOption
          selected={selected}
          label={option.label}
          value={option.value}
        />
      )}
    />
  );
};
