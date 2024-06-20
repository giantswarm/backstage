import type { FieldValidation } from '@rjsf/utils';

import { formDataRegexp } from './utils';

export const clusterPickerValidation = (
  value: string,
  validation: FieldValidation,
) => {
  if (!formDataRegexp.test(value)) {
    validation.addError(
      `Invalid cluster reference, installation and/or cluster names are not provided.`,
    );
  }
};
