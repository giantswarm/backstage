// ShowMore lives in ui-react so muster can use it too (muster cannot import
// from agent-platform, which depends on it). Re-exported for this plugin's
// existing imports.
export { ShowMore, USED_BY_ROWS } from '@giantswarm/backstage-plugin-ui-react';
export type { ShowMoreProps } from '@giantswarm/backstage-plugin-ui-react';
