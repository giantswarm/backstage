import {
  Kustomization,
  HelmRelease,
  GitRepository,
  OCIRepository,
  HelmRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findTargetClusterName } from '../../utils/findTargetClusterName';

export type FluxResourceData = {
  cluster: string;
  name: string;
  namespace?: string;
  kind: string;
  targetCluster?: string;
  // resourceType:
  //   | 'Kustomization'
  //   | 'HelmRelease'
  //   | 'GitRepository'
  //   | 'OCIRepository'
  //   | 'HelmRepository';
  // cluster: string;
  // status: string;
  // ready: boolean;
  // suspended: boolean;
  // dependencyNotReady: boolean;
  // source?: string;
  // revision?: string;
  // lastUpdated?: string;
  // age?: string;
  // conditions?: Array<{
  //   type: string;
  //   status: string;
  //   reason?: string;
  //   message?: string;
  // }>;
  // apiVersion: string;
  // kind: string;
};

// export function getAggregatedStatus(item: FluxResourceData): string {
//   if (item.suspended || item.dependencyNotReady) {
//     return 'inactive';
//   }
//   if (item.ready) {
//     return 'ready';
//   }
//   return 'not-ready';
// }

// function getResourceAge(creationTimestamp?: string): string {
//   if (!creationTimestamp) return '';

//   const created = new Date(creationTimestamp);
//   const now = new Date();
//   const diffMs = now.getTime() - created.getTime();

//   const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
//   const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
//   const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

//   if (days > 0) return `${days}d`;
//   if (hours > 0) return `${hours}h`;
//   return `${minutes}m`;
// }

// function extractConditions(resource: any) {
//   const conditions = resource.status?.conditions || [];
//   return conditions.map((condition: any) => ({
//     type: condition.type,
//     status: condition.status,
//     reason: condition.reason,
//     message: condition.message,
//   }));
// }

// function isResourceReady(resource: any): boolean {
//   const conditions = resource.status?.conditions || [];
//   const readyCondition = conditions.find((c: any) => c.type === 'Ready');
//   return readyCondition?.status === 'True';
// }

// function isResourceSuspended(resource: any): boolean {
//   return resource.spec?.suspend === true;
// }

// function isDependencyNotReady(resource: any): boolean {
//   const conditions = resource.status?.conditions || [];
//   return conditions.some(
//     (c: any) =>
//       c.type === 'Ready' &&
//       c.status === 'False' &&
//       c.reason?.includes('Dependency'),
//   );
// }

export function collectKustomizationData(
  resource: Kustomization,
): FluxResourceData {
  // const conditions = extractConditions(resource);
  // const ready = isResourceReady(resource);
  // const suspended = isResourceSuspended(resource);
  // const dependencyNotReady = isDependencyNotReady(resource);

  return {
    // installationName,
    // cluster,
    cluster: resource.cluster,
    name: resource.getName(),
    namespace: resource.getNamespace(),
    kind: resource.getKind(),
    targetCluster: findTargetClusterName(resource),
    // resourceType: 'Kustomization',
    // status: ready ? 'Ready' : 'Not Ready',
    // ready,
    // suspended,
    // dependencyNotReady,
    // source: resource.spec?.sourceRef?.name,
    // revision: resource.status?.lastAppliedRevision,
    // lastUpdated: resource.status?.lastAttemptedRevision
    //   ? new Date(resource.status.lastAttemptedRevision).toISOString()
    //   : undefined,
    // age: getResourceAge(resource.metadata.creationTimestamp),
    // conditions,
    // apiVersion: resource.apiVersion,
    // kind: resource.kind,
  };
}

export function collectHelmReleaseData(
  resource: HelmRelease,
): FluxResourceData {
  // const conditions = extractConditions(resource);
  // const ready = isResourceReady(resource);
  // const suspended = isResourceSuspended(resource);
  // const dependencyNotReady = isDependencyNotReady(resource);

  return {
    cluster: resource.cluster,
    name: resource.getName(),
    namespace: resource.getNamespace(),
    kind: resource.getKind(),
    targetCluster: findTargetClusterName(resource),
    // // resourceType: 'HelmRelease',
    // // status: ready ? 'Ready' : 'Not Ready',
    // ready,
    // suspended,
    // dependencyNotReady,
    // source: resource.spec?.sourceRef?.name,
    // revision: resource.status?.lastAppliedRevision,
    // lastUpdated: resource.status?.lastAttemptedRevision
    //   ? new Date(resource.status.lastAttemptedRevision).toISOString()
    //   : undefined,
    // age: getResourceAge(resource.metadata.creationTimestamp),
    // conditions,
    // apiVersion: resource.apiVersion,
    // kind: resource.kind,
  };
}

export function collectGitRepositoryData(
  resource: GitRepository,
): FluxResourceData {
  // const conditions = extractConditions(resource);
  // const ready = isResourceReady(resource);
  // const suspended = isResourceSuspended(resource);

  return {
    cluster: resource.cluster,
    name: resource.getName(),
    namespace: resource.getNamespace(),
    kind: resource.getKind(),
    // resourceType: 'GitRepository',
    // status: ready ? 'Ready' : 'Not Ready',
    // ready,
    // suspended,
    // dependencyNotReady: false,
    // source: resource.spec?.url,
    // revision: resource.status?.artifact?.revision,
    // lastUpdated: resource.status?.artifact?.lastUpdateTime,
    // age: getResourceAge(resource.metadata.creationTimestamp),
    // conditions,
    // apiVersion: resource.apiVersion,
    // kind: resource.kind,
  };
}

export function collectOCIRepositoryData(
  resource: OCIRepository,
): FluxResourceData {
  // const conditions = extractConditions(resource);
  // const ready = isResourceReady(resource);
  // const suspended = isResourceSuspended(resource);

  return {
    cluster: resource.cluster,
    name: resource.getName(),
    namespace: resource.getNamespace(),
    kind: resource.getKind(),
    // resourceType: 'OCIRepository',
    // status: ready ? 'Ready' : 'Not Ready',
    // ready,
    // suspended,
    // dependencyNotReady: false,
    // source: resource.spec?.url,
    // revision: resource.status?.artifact?.revision,
    // lastUpdated: resource.status?.artifact?.lastUpdateTime,
    // age: getResourceAge(resource.metadata.creationTimestamp),
    // conditions,
    // apiVersion: resource.apiVersion,
    // kind: resource.kind,
  };
}

export function collectHelmRepositoryData(
  resource: HelmRepository,
): FluxResourceData {
  // const conditions = extractConditions(resource);
  // const ready = isResourceReady(resource);
  // const suspended = isResourceSuspended(resource);

  return {
    cluster: resource.cluster,
    name: resource.getName(),
    namespace: resource.getNamespace(),
    kind: resource.getKind(),
    // resourceType: 'HelmRepository',
    // status: ready ? 'Ready' : 'Not Ready',
    // ready,
    // suspended,
    // dependencyNotReady: false,
    // source: resource.spec?.url,
    // revision: resource.status?.artifact?.revision,
    // lastUpdated: resource.status?.artifact?.lastUpdateTime,
    // age: getResourceAge(resource.metadata.creationTimestamp),
    // conditions,
    // apiVersion: resource.apiVersion,
    // kind: resource.kind,
  };
}

// Filter classes
// export class ClusterFilter {
//   constructor(public values: string[]) {}

//   filter(item: FluxResourceData): boolean {
//     return this.values.length === 0 || this.values.includes(item.cluster);
//   }
// }

// export class FluxResourceKindFilter {
//   constructor(public values: string[]) {}

//   filter(item: FluxResourceData): boolean {
//     return this.values.length === 0 || this.values.includes(item.resourceType);
//   }
// }

// export class FluxStatusFilter {
//   constructor(public values: string[]) {}

//   filter(item: FluxResourceData): boolean {
//     if (this.values.length === 0) return true;
//     const aggregatedStatus = getAggregatedStatus(item);
//     return this.values.includes(aggregatedStatus);
//   }
// }
