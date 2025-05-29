import type { FieldValidation } from '@rjsf/utils';
import { ClusterPickerValue } from './schema';

export const clusterPickerValidation = (
  value: ClusterPickerValue,
  validation: FieldValidation,
) => {
  if (!value.clusterName) {
    validation.addError(`Please fill in this field`);
  }
};
