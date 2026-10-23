export * from './layout';
export * from './tableHelpers';
export { countNoun } from './countNoun';
export { formatVersion } from './formatVersion';
export { isTableColumnHidden } from './isTableColumnHidden';
export { joinNames, groupNames, NAMED_IN_SENTENCE } from './joinNames';
export type { JoinNamesOptions, NameGroup } from './joinNames';
export { passwordManagerIgnoreProps } from './passwordManagerProps';
export { searchableIf } from './searchableIf';
export { tokenize, matchesQuery } from './tokenSearch';
export { toneColors, VIOLET } from './tones';
export type { Tone, ToneColors } from './tones';
export {
  assignSeriesColors,
  categoricalColors,
  otherSeriesColor,
  MAX_CATEGORICAL_SERIES,
  OTHER_SERIES_LABEL,
} from './chartPalette';
export { saveFile } from './saveFile';
// One rule for every SHA the portal shows, frontend and backend alike.
export {
  shortSha,
  SHORT_SHA_LENGTH,
} from '@giantswarm/backstage-plugin-gs-common';
export { stopRowPress } from './rowPress';
export { MENU_WIDTH } from './menuWidth';
export { createMarkdownLinkResolver } from './resolveMarkdownLink';
export { isAwaitingData } from './isAwaitingData';
export { liveRouterState } from './liveRouterState';
export { isWebURL, safeWebURL } from './webURL';
export {
  PHONE_MAX_WIDTH,
  PHONE_QUERY,
  PHONE_MEDIA,
  TWO_COLUMN_MIN_WIDTH,
  TWO_COLUMN_QUERY,
  TWO_COLUMN_MEDIA,
  TOUCH_QUERY,
  TOUCH_MEDIA,
  useMediaQueryMatch,
  usePhoneLayout,
  useTouchInput,
} from './breakpoints';
