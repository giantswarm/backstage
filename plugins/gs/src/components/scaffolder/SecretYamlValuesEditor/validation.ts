import type { FieldValidation } from '@rjsf/utils';
import { SecretYamlValuesEditorValue } from './schema';

const REDACTED_PLACEHOLDER = '***REDACTED***';

export const secretYamlValuesEditorValidation = (
  value: SecretYamlValuesEditorValue,
  _validation: FieldValidation,
) => {
  // The actual YAML is stored in the secrets context, not in formData.
  // formData will be the redacted placeholder when content exists.
  // We skip YAML parsing validation here since the actual content
  // is validated through the YamlValuesValidation field component.
  if (value === REDACTED_PLACEHOLDER) {
    return;
  }

  // If empty/undefined, no validation needed (field may not be required)
  if (!value) {
    return;
  }
};
