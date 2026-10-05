import {
  FluxInstance,
  FluxOperatorObject,
  FluxReport,
  ResourceSet,
  ResourceSetInputProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  DateComponent,
  ExternalLink,
} from '@giantswarm/backstage-plugin-ui-react';
import { buildStatusMetadata, Metadata } from './buildStatusMetadata';

function joinParts(parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(', ');
}

function formatLink(url: string) {
  return /^https?:\/\//.test(url) ? (
    <ExternalLink href={url}>{url}</ExternalLink>
  ) : (
    url
  );
}

/**
 * Status fields every Flux Operator kind shares: its last reconciliation from
 * `status.history`, the Ready condition, and who suspended it.
 */
function getOperatorStatus(resource: FluxOperatorObject): Metadata {
  const metadata: Metadata = {};

  const lastReconciliation = resource.getLastReconciliation();
  if (lastReconciliation) {
    metadata['Last Run'] = (
      <>
        <DateComponent value={lastReconciliation.lastReconciled} relative />
        {` (took ${lastReconciliation.lastReconciledDuration})`}
      </>
    );
  }

  Object.assign(metadata, buildStatusMetadata(resource.findReadyCondition()));

  const suspendedBy = resource.isSuspended()
    ? resource.getSuspendedBy()
    : undefined;
  if (suspendedBy) {
    metadata['Suspended By'] = suspendedBy;
  }

  return metadata;
}

// --- FluxInstance ---

function getFluxInstanceSpec(fluxInstance: FluxInstance): Metadata {
  const metadata: Metadata = {};

  const distribution = fluxInstance.getDistribution();
  if (distribution) {
    metadata['Flux Version'] = distribution.version;
    metadata.Registry = distribution.registry;
    if (distribution.variant) {
      metadata.Variant = distribution.variant;
    }
  }

  const components = fluxInstance.getComponents();
  if (components && components.length > 0) {
    metadata.Components = components.join(', ');
  }

  const cluster = fluxInstance.getClusterConfig();
  if (cluster) {
    const summary = joinParts([
      cluster.type,
      cluster.size && `size ${cluster.size}`,
      cluster.multitenant && 'multi-tenant',
    ]);
    if (summary) {
      metadata.Cluster = summary;
    }
  }

  const sync = fluxInstance.getSync();
  if (sync) {
    metadata['Sync Source'] = formatLink(sync.url);
    metadata['Sync Ref'] = sync.ref;
    metadata['Sync Path'] = sync.path;
  }

  return metadata;
}

function getFluxInstanceStatus(fluxInstance: FluxInstance): Metadata {
  const metadata: Metadata = {};

  const revision = fluxInstance.getLastAppliedRevision();
  if (revision) {
    metadata.Revision = revision;
  }

  return Object.assign(metadata, getOperatorStatus(fluxInstance));
}

// --- ResourceSet ---

function getResourceSetSpec(resourceSet: ResourceSet): Metadata {
  const metadata: Metadata = {};

  metadata['Input Strategy'] = resourceSet.getInputStrategy();

  const inputs = resourceSet.getInputs();
  if (inputs && inputs.length > 0) {
    metadata.Inputs = inputs.length;
  }

  const inputProviderRefs = resourceSet.getInputProviderRefs();
  if (inputProviderRefs.length > 0) {
    metadata['Input Providers'] = inputProviderRefs
      .map(ref => ('name' in ref ? ref.name : 'by label selector'))
      .join(', ');
  }

  const serviceAccountName = resourceSet.getServiceAccountName();
  if (serviceAccountName) {
    metadata['Service Account'] = serviceAccountName;
  }

  metadata['Health Check'] = resourceSet.getWait() ? 'Enabled' : 'Disabled';

  return metadata;
}

function getResourceSetStatus(resourceSet: ResourceSet): Metadata {
  const metadata: Metadata = {};

  const revision = resourceSet.getLastAppliedRevision();
  if (revision) {
    metadata.Revision = revision;
  }

  const inventory = resourceSet.getInventory();
  if (inventory) {
    metadata['Managed Objects'] = inventory.entries.length;
  }

  return Object.assign(metadata, getOperatorStatus(resourceSet));
}

// --- ResourceSetInputProvider ---

function formatFilter(
  filter: ReturnType<ResourceSetInputProvider['getFilter']>,
): string {
  if (!filter) {
    return '';
  }

  return joinParts([
    filter.semver && `semver ${filter.semver}`,
    filter.includeBranch && `branches ${filter.includeBranch}`,
    filter.excludeBranch && `not branches ${filter.excludeBranch}`,
    filter.includeTag && `tags ${filter.includeTag}`,
    filter.excludeTag && `not tags ${filter.excludeTag}`,
    filter.includeEnvironment && `environments ${filter.includeEnvironment}`,
    filter.excludeEnvironment &&
      `not environments ${filter.excludeEnvironment}`,
    filter.labels &&
      filter.labels.length > 0 &&
      `labels ${filter.labels.join(', ')}`,
    filter.limit !== undefined && `at most ${filter.limit}`,
  ]);
}

function getResourceSetInputProviderSpec(
  provider: ResourceSetInputProvider,
): Metadata {
  const metadata: Metadata = {};

  metadata.Type = provider.getType();

  const url = provider.getURL();
  if (url) {
    metadata.URL = formatLink(url);
  }

  const filter = formatFilter(provider.getFilter());
  if (filter) {
    metadata.Filter = filter;
  }

  const schedule = provider.getSchedule();
  if (schedule && schedule.length > 0) {
    metadata.Schedule = schedule
      .map(s =>
        joinParts([
          `${s.cron} (${s.timeZone ?? 'UTC'})`,
          s.window && `window ${s.window}`,
        ]),
      )
      .join('; ');
  }

  return metadata;
}

function getResourceSetInputProviderStatus(
  provider: ResourceSetInputProvider,
): Metadata {
  const metadata: Metadata = {};

  const exportedInputs = provider.getExportedInputs();
  if (exportedInputs) {
    metadata['Exported Inputs'] = exportedInputs.length;
  }

  const revision = provider.getLastExportedRevision();
  if (revision) {
    metadata.Revision = revision;
  }

  const nextSchedule = provider.getNextSchedule();
  if (nextSchedule) {
    metadata['Next Run'] = <DateComponent value={nextSchedule.when} relative />;
  }

  return Object.assign(metadata, getOperatorStatus(provider));
}

// --- FluxReport ---

function getFluxReportSpec(fluxReport: FluxReport): Metadata {
  const metadata: Metadata = {};

  const distribution = fluxReport.getDistribution();
  if (distribution) {
    metadata['Flux Version'] = distribution.version ?? distribution.status;
    if (distribution.managedBy) {
      metadata['Managed By'] = distribution.managedBy;
    }
  }

  const operator = fluxReport.getOperator();
  if (operator) {
    metadata['Operator Version'] = operator.version;
  }

  const cluster = fluxReport.getClusterInfo();
  if (cluster) {
    metadata.Kubernetes = joinParts([
      cluster.serverVersion,
      cluster.platform,
      cluster.nodes !== undefined && `${cluster.nodes} nodes`,
    ]);
  }

  const sync = fluxReport.getSync();
  if (sync) {
    metadata.Sync = joinParts([sync.source, sync.path && `path ${sync.path}`]);
    metadata['Sync Status'] = sync.status;
  }

  return metadata;
}

function getFluxReportStatus(fluxReport: FluxReport): Metadata {
  const metadata: Metadata = {};

  const components = fluxReport.getComponents();
  if (components && components.length > 0) {
    const notReady = components.filter(c => !c.ready).map(c => c.name);
    metadata.Components =
      notReady.length === 0
        ? `${components.length} ready`
        : `${components.length - notReady.length} of ${
            components.length
          } ready, not ready: ${notReady.join(', ')}`;
  }

  const reconcilers = fluxReport.getReconcilers();
  if (reconcilers && reconcilers.length > 0) {
    const failing = reconcilers.reduce(
      (sum, r) => sum + (r.stats?.failing ?? 0),
      0,
    );
    const suspended = reconcilers.reduce(
      (sum, r) => sum + (r.stats?.suspended ?? 0),
      0,
    );
    const running = reconcilers.reduce(
      (sum, r) => sum + (r.stats?.running ?? 0),
      0,
    );
    metadata.Reconcilers = `${running} running, ${failing} failing, ${suspended} suspended`;

    const failingKinds = reconcilers
      .filter(r => (r.stats?.failing ?? 0) > 0)
      .map(r => `${r.kind} (${r.stats!.failing})`);
    if (failingKinds.length > 0) {
      metadata['Failing Kinds'] = failingKinds.join(', ');
    }
  }

  Object.assign(metadata, buildStatusMetadata(fluxReport.findReadyCondition()));

  return metadata;
}

/**
 * The spec and status fields of a Flux Operator object, or nothing for any
 * other resource.
 */
export function getFluxOperatorSpecAndStatus(
  resource: unknown,
): { spec: Metadata; status: Metadata } | undefined {
  if (resource instanceof FluxInstance) {
    return {
      spec: getFluxInstanceSpec(resource),
      status: getFluxInstanceStatus(resource),
    };
  }
  if (resource instanceof ResourceSet) {
    return {
      spec: getResourceSetSpec(resource),
      status: getResourceSetStatus(resource),
    };
  }
  if (resource instanceof ResourceSetInputProvider) {
    return {
      spec: getResourceSetInputProviderSpec(resource),
      status: getResourceSetInputProviderStatus(resource),
    };
  }
  if (resource instanceof FluxReport) {
    return {
      spec: getFluxReportSpec(resource),
      status: getFluxReportStatus(resource),
    };
  }

  return undefined;
}
