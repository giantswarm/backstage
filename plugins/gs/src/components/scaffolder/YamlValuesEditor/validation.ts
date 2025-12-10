import type { FieldValidation } from '@rjsf/utils';
import { YamlValuesEditorValue } from './schema';
import * as yaml from 'js-yaml';

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.split('\n\n 1 |')[0];
  }

  return String(error);
}

export const yamlValuesEditorValidation = (
  value: YamlValuesEditorValue,
  validation: FieldValidation,
) => {
  const errors: string[] = [];
  let valuesObj: any = {};

  // Parse values YAML
  if (value) {
    try {
      valuesObj = yaml.load(value) || {};
      if (typeof valuesObj !== 'object' || Array.isArray(valuesObj)) {
        errors.push('must be a valid YAML object');
      }
    } catch (err) {
      errors.push(formatErrorMessage(err));
    }
  }

  if (errors.length > 0) {
    errors.forEach(error => validation.addError(error));
  }
};
