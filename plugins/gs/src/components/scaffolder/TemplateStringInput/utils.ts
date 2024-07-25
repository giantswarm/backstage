import { generateUID } from '../../utils/generateUID';

export const formDataRegexp = /^[a-z]([-_\.a-z0-9]*[a-z0-9])?$/;

const PLACEHOLDER_REGEXP = /\${{[\w\(\)]+}}/g;
const GENERATE_UID_PLACEHOLDER_REGEXP =
  /\${{generateUID\((?<length>[1-9]\d*)\)}}/;
const FORM_DATA_VALUE_PLACEHOLDER_REGEXP = /\${{(?<parameter>\w+)}}/;

function replaceGenerateUIDPlaceholder(template: string, placeholder: string) {
  const match = template.match(GENERATE_UID_PLACEHOLDER_REGEXP);
  if (!match || !match.groups) {
    return template;
  }

  const length = parseInt(match.groups.length, 10);
  const uid = generateUID(length);

  return template.replace(placeholder, uid);
}

function replaceFormDataValuePlaceholder(
  template: string,
  placeholder: string,
  formData?: Record<string, any>,
) {
  const match = template.match(FORM_DATA_VALUE_PLACEHOLDER_REGEXP);
  if (!match || !match.groups) {
    return template;
  }

  const parameter = match.groups.parameter;
  const value = formData?.[parameter];
  if (!value) {
    return template;
  }

  return template.replace(placeholder, value);
}

export function formatInitialValue(
  template: string,
  formData?: Record<string, any>,
) {
  let newTemplate = template;

  for (const placeholderMatch of template.matchAll(PLACEHOLDER_REGEXP)) {
    const placeholder = placeholderMatch[0];

    if (GENERATE_UID_PLACEHOLDER_REGEXP.test(placeholder)) {
      newTemplate = replaceGenerateUIDPlaceholder(newTemplate, placeholder);
    }

    if (FORM_DATA_VALUE_PLACEHOLDER_REGEXP.test(placeholder)) {
      newTemplate = replaceFormDataValuePlaceholder(
        newTemplate,
        placeholder,
        formData,
      );
    }
  }

  return newTemplate;
}
