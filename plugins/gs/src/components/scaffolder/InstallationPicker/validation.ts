import type { FieldValidation } from '@rjsf/utils';
import { InstallationPickerValue } from './schema';

export const installationPickerValidation = (
  value: InstallationPickerValue,
  validation: FieldValidation,
) => {
  if (!value.installationName) {
    validation.addError(`Please fill in this field`);
  }
};
