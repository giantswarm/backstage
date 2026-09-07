// `getInstallationOidcToken` lives in kubernetes-react since the muster plugin
// mints the same per-installation token for non-home musters; this re-export
// keeps the agent-platform import paths (kagent + model-manager clients, the
// deploy flow) unchanged.
export { getInstallationOidcToken } from '@giantswarm/backstage-plugin-kubernetes-react';
