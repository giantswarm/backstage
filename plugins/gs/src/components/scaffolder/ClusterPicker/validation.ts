import type { FieldValidation } from '@rjsf/utils';

import { formDataRegexp } from './utils';

/**
 * The validation function for the `repoUrl` that is returned from the
 * field extension. Ensures that you have all the required fields filled for
 * the different providers that exist.
 *
 * @public
 */
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
