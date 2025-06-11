import { LabelConfig } from './types';

const keyValuePredicate = (key: string, value: string) => {
  return (labelConfig: LabelConfig) => labelConfig.label === `${key}:${value}`;
};

const keyPatternPredicate = (key: string) => {
  return (labelConfig: LabelConfig) => {
    const labelRegExp = new RegExp(
      `^${labelConfig.label.replace(/\*/g, '.*')}$`,
    );
    return labelRegExp.test(key);
  };
};

export function findLabelConfig(
  key: string,
  value: string,
  labelsConfig: LabelConfig[],
) {
  return (
    labelsConfig.find(keyValuePredicate(key, value)) ??
    labelsConfig.find(keyPatternPredicate(key)) ??
    null
  );
}

export function findLabelConfigIndex(
  key: string,
  value: string,
  labelsConfig: LabelConfig[],
) {
  const index = labelsConfig.findIndex(keyValuePredicate(key, value));
  if (index !== -1) {
    return index;
  }

  return labelsConfig.findIndex(keyPatternPredicate(key));
}
