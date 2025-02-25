import { get } from 'lodash';
import { generateUID } from '../utils/generateUID';

const GENERATE_UID_PLACEHOLDER_REGEXP =
  /\${{generateUID\((?<length>[1-9]\d*)\)}}/;
const DATA_VALUE_PLACEHOLDER_REGEXP = /\${{(?<parameter>[\w\.]+)}}/;

function replaceGenerateUIDPlaceholder(template: string, placeholder: string) {
  const match = template.match(GENERATE_UID_PLACEHOLDER_REGEXP);
  if (!match || !match.groups) {
    return template;
  }

  const length = parseInt(match.groups.length, 10);
  const uid = generateUID(length);

  return template.replace(placeholder, uid);
}

function replaceDataValuePlaceholder(
  template: string,
  placeholder: string,
  data?: Record<string, any>,
) {
  const match = template.match(DATA_VALUE_PLACEHOLDER_REGEXP);
  if (!match || !match.groups) {
    return template;
  }

  const parameter = match.groups.parameter;
  const value = get(data ?? {}, parameter);
  if (!value) {
    return template;
  }

  return template.replace(placeholder, value);
}

export function formatTemplateString(
  template: string,
  data?: Record<string, any>,
) {
  let newTemplate = template;

  const placeholderRegexp = new RegExp(
    [
      GENERATE_UID_PLACEHOLDER_REGEXP.source,
      DATA_VALUE_PLACEHOLDER_REGEXP.source,
    ].join('|'),
    'g',
  );
  for (const placeholderMatch of template.matchAll(placeholderRegexp)) {
    const placeholder = placeholderMatch[0];

    if (GENERATE_UID_PLACEHOLDER_REGEXP.test(placeholder)) {
      newTemplate = replaceGenerateUIDPlaceholder(newTemplate, placeholder);
    }

    if (DATA_VALUE_PLACEHOLDER_REGEXP.test(placeholder)) {
      newTemplate = replaceDataValuePlaceholder(newTemplate, placeholder, data);
    }
  }

  return newTemplate;
}
