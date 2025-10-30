// import { AppKind, Deployment } from '@giantswarm/backstage-plugin-gs-common';

// export function calculateDeploymentLabels(deployment: Deployment) {
//   if (!deployment.metadata.labels) {
//     return undefined;
//   }

//   return Object.entries(deployment.metadata.labels).map(([key, value]) => {
//     return value === '' ? key : `${key}: ${value}`;
//   });
// }

// export function formatDeploymentType(kind: string) {
//   return kind.toLowerCase() === AppKind.toLowerCase() ? 'App' : 'HelmRelease';
// }
