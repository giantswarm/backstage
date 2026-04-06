import type { FieldValidation } from '@rjsf/utils';
import type { ValueSourcesEditorValue } from './schema';

type ValueSourceItem = NonNullable<ValueSourcesEditorValue>[number];

function hasValues(item: ValueSourceItem): boolean {
  return Boolean(item.values);
}

export const valueSourcesEditorValidation = (
  value: ValueSourcesEditorValue,
  validation: FieldValidation,
) => {
  if (!value || !Array.isArray(value)) return;

  const itemsWithValues = value.filter(hasValues);

  for (let i = 0; i < itemsWithValues.length; i++) {
    const item = itemsWithValues[i];
    if (!item.name || item.name.trim() === '') {
      validation.addError(
        `Item ${i + 1}: name is required when values are provided`,
      );
    }
  }

  const nameCount = new Map<string, number>();
  for (const item of itemsWithValues) {
    if (item.name && item.name.trim() !== '') {
      const key = item.name.trim();
      nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
    }
  }

  for (const [name, count] of nameCount) {
    if (count > 1) {
      validation.addError(
        `Duplicate name "${name}" — each value source must have a unique name`,
      );
    }
  }
};
