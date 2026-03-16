import { useCallback, useEffect, useMemo } from 'react';
import { TextField } from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef, parseEntityRef } from '@backstage/catalog-model';
import useAsync from 'react-use/esm/useAsync';
import { EntityPickerProps } from './schema';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

export const EntityPicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Entity', description = 'An entity from the catalog' },
  uiSchema,
  idSchema,
  formContext,
}: EntityPickerProps) => {
  const {
    allowArbitraryValues,
    catalogFilter,
    disabledWhenField: disabledWhenFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const isDisabledByField = useValueFromOptions<boolean>(
    formContext,
    undefined,
    disabledWhenFieldOption,
  );

  const catalogApi = useApi(catalogApiRef);

  const { value: entities, loading } = useAsync(async () => {
    let filters: any[];
    if (Array.isArray(catalogFilter)) {
      filters = catalogFilter;
    } else if (catalogFilter) {
      filters = [catalogFilter];
    } else {
      filters = [];
    }

    if (filters.length === 0) {
      const { items } = await catalogApi.getEntities();
      return items;
    }

    const results = await Promise.all(
      filters.map(filter =>
        catalogApi.getEntities({ filter: filter as Record<string, string> }),
      ),
    );

    const seen = new Set<string>();
    return results
      .flatMap(r => r.items)
      .filter(entity => {
        const ref = stringifyEntityRef(entity);
        if (seen.has(ref)) return false;
        seen.add(ref);
        return true;
      });
  }, [catalogFilter]);

  const entityRefs = useMemo(
    () =>
      (entities ?? [])
        .map(e => stringifyEntityRef(e))
        .sort((a, b) => {
          try {
            return parseEntityRef(a).name.localeCompare(parseEntityRef(b).name);
          } catch {
            return a.localeCompare(b);
          }
        }),
    [entities],
  );

  const handleChange = useCallback(
    (_: any, newValue: string | null) => {
      onChange(newValue ?? undefined);
    },
    [onChange],
  );

  useEffect(() => {
    // Clear value if it's not in the available options
    if (!loading && formData && !allowArbitraryValues) {
      if (entityRefs.length > 0 && !entityRefs.includes(formData)) {
        onChange(undefined);
      }
    }
  }, [loading, entityRefs, formData, allowArbitraryValues, onChange]);

  if (isDisabledByField) {
    const displayName = formData
      ? (() => {
          try {
            const parsed = parseEntityRef(formData);
            return parsed.name;
          } catch {
            return formData;
          }
        })()
      : '';

    return (
      <TextField
        id={idSchema?.$id}
        label={title}
        required={required}
        value={displayName}
        disabled
        margin="dense"
        variant="outlined"
        InputLabelProps={{ shrink: true }}
      />
    );
  }

  return (
    <Autocomplete
      id={idSchema?.$id}
      value={formData ?? null}
      loading={loading}
      onChange={handleChange}
      options={entityRefs}
      getOptionLabel={option => {
        try {
          return parseEntityRef(option).name;
        } catch {
          return option;
        }
      }}
      freeSolo={allowArbitraryValues}
      renderInput={params => (
        <TextField
          {...params}
          label={title}
          helperText={description}
          required={required}
          error={rawErrors?.length > 0 && !formData}
          margin="dense"
          variant="outlined"
          InputProps={params.InputProps}
          InputLabelProps={params.InputLabelProps}
        />
      )}
    />
  );
};
