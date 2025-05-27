import { useMemo } from 'react';
import { get } from 'lodash';

export function useValueFromOptions<T>(
  formContext: any,
  valueOption: T | undefined,
  fieldOption: string | undefined,
): T | undefined {
  return useMemo(() => {
    if (valueOption) {
      return valueOption;
    }

    if (fieldOption) {
      const allFormData = (formContext.formData as Record<string, any>) ?? {};
      const fieldValue = get(allFormData, fieldOption) as T;

      return fieldValue;
    }

    return undefined;
  }, [valueOption, fieldOption, formContext.formData]);
}
