import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  DateComponent,
  type Fact,
  FactList,
  Mono,
  StatusDot,
  type StatusDotTone,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  getAggregatedStatus,
  getStatus,
} from '../../deployments/utils/getStatus';
import { toSentenceCase } from '../../utils/helpers';

/** What the installer's state means for the cluster, as the classic page reads it. */
export type InstallerOutcome = 'deleting' | 'failed' | 'creating';

/**
 * Where an App or HelmRelease that installs a cluster stands, read as the
 * classic cluster page's `ClusterAppStatus` reads it: being deleted when it
 * carries a deletion timestamp, failed when its release failed or stalled,
 * otherwise still creating the cluster.
 */
export function installerOutcome(
  installer: App | HelmRelease,
): InstallerOutcome {
  if (installer.getDeletionTimestamp()) {
    return 'deleting';
  }
  return getAggregatedStatus(installer) === 'failed' ? 'failed' : 'creating';
}

const TONES: Record<string, StatusDotTone> = {
  successful: 'success',
  pending: 'info',
  failed: 'danger',
};

/**
 * The installer's status as facts: its kind and name, its release status,
 * when the App last deployed, and why it is not ready (the App's release
 * reason, a HelmRelease's Ready condition).
 */
export function PlatformInstallerStatus({
  installer,
}: {
  installer: App | HelmRelease;
}) {
  const status = getStatus(installer);
  const aggregated = getAggregatedStatus(installer);
  const facts: Fact[] = [
    {
      label: 'Installed by',
      value: <Mono>{`${installer.getKind()} ${installer.getName()}`}</Mono>,
    },
    {
      label: 'Status',
      value: status ? (
        <StatusDot
          tone={(aggregated && TONES[aggregated]) ?? 'neutral'}
          label={toSentenceCase(status.replace(/-/g, ' '))}
        />
      ) : (
        'Not reported yet'
      ),
    },
  ];
  if (installer instanceof App) {
    const release = installer.getStatus()?.release;
    if (release?.lastDeployed) {
      facts.push({
        label: 'Last deployed',
        value: <DateComponent value={release.lastDeployed} relative />,
      });
    }
    if (release?.reason) {
      facts.push({ label: 'Reason', value: release.reason });
    }
  } else {
    const ready = installer.findReadyCondition();
    if (ready?.status !== 'True' && ready?.message) {
      facts.push({ label: 'Ready condition', value: ready.message });
    }
  }
  return <FactList facts={facts} labelWidth={170} size="medium" />;
}
