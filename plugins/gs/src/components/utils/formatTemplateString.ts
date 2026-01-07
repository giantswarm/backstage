import { get } from 'lodash';
import { generateUID } from '../utils/generateUID';
import { parseChartRef } from './parseChartRef';

const CURRENT_USER_PLACEHOLDER_REGEXP = /\${{currentUser\(\)}}/;
const GENERATE_UID_PLACEHOLDER_REGEXP =
  /\${{generateUID\((?<length>[1-9]\d*)\)}}/;
const CHART_NAME_PLACEHOLDER_REGEXP = /\${{chartName\((?<chartRef>[\w\.]+)\)}}/;
const CLUSTER_NAME_PREFIX_PLACEHOLDER_REGEXP =
  /\${{clusterNamePrefix\((?<clusterRef>[\w\.]+)\)}}/;
const DATA_VALUE_PLACEHOLDER_REGEXP = /\${{(?<parameter>[\w\.]+)}}/;

function replaceCurrentUserPlaceholder(
  template: string,
  placeholder: string,
  currentUser: string,
) {
  const match = template.match(CURRENT_USER_PLACEHOLDER_REGEXP);
  if (!match) {
    return template;
  }

  return template.replace(placeholder, currentUser);
}

function replaceGenerateUIDPlaceholder(template: string, placeholder: string) {
  const match = template.match(GENERATE_UID_PLACEHOLDER_REGEXP);
  if (!match || !match.groups) {
    return template;
  }

  const length = parseInt(match.groups.length, 10);
  const uid = generateUID(length);

  return template.replace(placeholder, uid);
}

function replaceChartNamePlaceholder(
  template: string,
  placeholder: string,
  data?: Record<string, any>,
) {
  const match = template.match(CHART_NAME_PLACEHOLDER_REGEXP);
  if (!match || !match.groups) {
    return template;
  }

  const chartRef = match.groups.chartRef;

  const value = get(data ?? {}, chartRef);
  if (!value) {
    return template;
  }

  const chartName = parseChartRef(value).name;

  return template.replace(placeholder, chartName);
}

function replaceClusterNamePrefixPlaceholder(
  template: string,
  placeholder: string,
  data?: Record<string, any>,
) {
  const match = template.match(CLUSTER_NAME_PREFIX_PLACEHOLDER_REGEXP);
  if (!match || !match.groups) {
    return template;
  }

  const clusterRef = match.groups.clusterRef;

  const value = get(data ?? {}, clusterRef);
  if (!value) {
    return template;
  }

  const clusterName = value.clusterName;
  const isManagementCluster = value.isManagementCluster;

  if (!clusterName) {
    return template;
  }

  if (isManagementCluster) {
    return template.replace(placeholder, '');
  }

  return template.replace(placeholder, `${clusterName}-`);
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

type Options = {
  data?: Record<string, any>;
  currentUser?: string;
};

export function formatTemplateString(template: string, options: Options = {}) {
  const { data, currentUser } = options;

  let newTemplate = template;

  const placeholderRegexp = new RegExp(
    [
      CURRENT_USER_PLACEHOLDER_REGEXP.source,
      GENERATE_UID_PLACEHOLDER_REGEXP.source,
      CHART_NAME_PLACEHOLDER_REGEXP.source,
      CLUSTER_NAME_PREFIX_PLACEHOLDER_REGEXP.source,
      DATA_VALUE_PLACEHOLDER_REGEXP.source,
    ].join('|'),
    'g',
  );
  for (const placeholderMatch of template.matchAll(placeholderRegexp)) {
    const placeholder = placeholderMatch[0];

    if (CURRENT_USER_PLACEHOLDER_REGEXP.test(placeholder)) {
      newTemplate = currentUser
        ? replaceCurrentUserPlaceholder(newTemplate, placeholder, currentUser)
        : newTemplate;
    }

    if (GENERATE_UID_PLACEHOLDER_REGEXP.test(placeholder)) {
      newTemplate = replaceGenerateUIDPlaceholder(newTemplate, placeholder);
    }

    if (CHART_NAME_PLACEHOLDER_REGEXP.test(placeholder)) {
      newTemplate = replaceChartNamePlaceholder(newTemplate, placeholder, data);
    }

    if (CLUSTER_NAME_PREFIX_PLACEHOLDER_REGEXP.test(placeholder)) {
      newTemplate = replaceClusterNamePrefixPlaceholder(
        newTemplate,
        placeholder,
        data,
      );
    }

    if (DATA_VALUE_PLACEHOLDER_REGEXP.test(placeholder)) {
      newTemplate = replaceDataValuePlaceholder(newTemplate, placeholder, data);
    }
  }

  if (placeholderRegexp.test(newTemplate)) {
    return null;
  }

  return newTemplate;
}
