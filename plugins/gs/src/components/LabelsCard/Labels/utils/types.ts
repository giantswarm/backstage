import { LabelVariant } from './makeLabelVariants';

export type Label = {
  key: string;
  value: string;
};

export type LabelWithDisplayInfo = Label & {
  formattedKey: string;
  formattedValue?: string;
  variant?: LabelVariant;
};

export type LabelConfig = {
  label: string;
  key?: string;
  valueMap?: Record<string, string>;
  variant?: LabelVariant;
};
