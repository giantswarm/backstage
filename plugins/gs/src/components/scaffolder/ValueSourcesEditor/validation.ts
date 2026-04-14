import type { FieldValidation } from '@rjsf/utils';
import { isValidDNSSubdomainName } from '@giantswarm/backstage-plugin-kubernetes-react';
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
    const name = item.name?.trim() ?? '';

    if (!name) {
      validation.addError(
        `Item ${i + 1}: name is required when values are provided`,
      );
    } else if (!isValidDNSSubdomainName(name)) {
      validation.addError(
        `Item ${i + 1}: name "${name}" is not a valid Kubernetes resource name (must be lowercase, alphanumeric, '-' or '.', max 253 chars)`,
      );
    }
  }

  const kindGroups = new Map<string, string[]>();
  for (const item of itemsWithValues) {
    const name = item.name?.trim() ?? '';
    if (name) {
      const names = kindGroups.get(item.kind) ?? [];
      names.push(name);
      kindGroups.set(item.kind, names);
    }
  }

  for (const [kind, names] of kindGroups) {
    const nameCount = new Map<string, number>();
    for (const name of names) {
      nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
    }
    for (const [name, count] of nameCount) {
      if (count > 1) {
        validation.addError(
          `Duplicate ${kind} name "${name}" — each ${kind} must have a unique name`,
        );
      }
    }
  }
};
