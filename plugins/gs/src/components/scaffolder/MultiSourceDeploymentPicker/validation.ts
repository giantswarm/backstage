import type { FieldValidation } from '@rjsf/utils';
import { MultiSourceDeploymentPickerValue } from './schema';

export const multiSourceDeploymentPickerValidation = (
  value: MultiSourceDeploymentPickerValue,
  validation: FieldValidation,
) => {
  if (!value) {
    validation.addError('Deployment data is still loading, please wait.');
  }
};
