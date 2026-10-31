import type { ReactNode } from 'react';
import {
  AWSProviderIcon,
  GrafanaIcon,
  KubernetesIcon,
} from '@giantswarm/backstage-plugin-gs';
import type { ConnectorBrand } from '../../lib/connectorLogo';
import { SIMPLE_ICON_PATHS } from './simpleIcons';

const FILL = { width: '100%', height: '100%', fontSize: 'inherit' } as const;

function SimpleIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/**
 * Each brand's mark, in the text colour so it reads in both themes: the
 * portal's own icons where it has one, simple-icons' otherwise.
 */
export const BRAND_MARKS: Record<ConnectorBrand, () => ReactNode> = {
  atlassian: () => <SimpleIcon path={SIMPLE_ICON_PATHS.atlassian} />,
  aws: () => <AWSProviderIcon style={FILL} aria-hidden />,
  confluence: () => <SimpleIcon path={SIMPLE_ICON_PATHS.confluence} />,
  datadog: () => <SimpleIcon path={SIMPLE_ICON_PATHS.datadog} />,
  github: () => <SimpleIcon path={SIMPLE_ICON_PATHS.github} />,
  gitlab: () => <SimpleIcon path={SIMPLE_ICON_PATHS.gitlab} />,
  googledrive: () => <SimpleIcon path={SIMPLE_ICON_PATHS.googledrive} />,
  grafana: () => <GrafanaIcon style={FILL} aria-hidden />,
  jira: () => <SimpleIcon path={SIMPLE_ICON_PATHS.jira} />,
  kubernetes: () => <KubernetesIcon style={FILL} aria-hidden />,
  linear: () => <SimpleIcon path={SIMPLE_ICON_PATHS.linear} />,
  miro: () => <SimpleIcon path={SIMPLE_ICON_PATHS.miro} />,
  notion: () => <SimpleIcon path={SIMPLE_ICON_PATHS.notion} />,
  pagerduty: () => <SimpleIcon path={SIMPLE_ICON_PATHS.pagerduty} />,
  sentry: () => <SimpleIcon path={SIMPLE_ICON_PATHS.sentry} />,
};
