import sha256 from 'crypto-js/sha256';

export function getTelemetryPageViewPayload(pathname: string): {
  [key: string]: string;
} {
  let payload = {};

  switch (true) {
    case pathname === '/':
      payload = { page: 'Home' };
      break;

    case pathname === '/catalog':
      payload = { page: 'Catalog index' };
      break;

    case pathname === '/catalog-graph':
      payload = { page: 'Catalog graph' };
      break;

    case pathname.startsWith('/catalog'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Catalog entity',
        entityNamespace: parts[2],
        entityKind: parts[3],
        entityName: parts[4],
        tab: parts[5] ?? 'overview',
      };
      break;
    }

    case pathname === '/docs':
      payload = { page: 'Docs index' };
      break;

    case pathname.startsWith('/docs'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Docs entity',
        entityNamespace: parts[2],
        entityKind: parts[3],
        entityName: parts[4],
      };
      break;
    }

    case pathname === '/create':
      payload = { page: 'Software Templates index' };
      break;

    case pathname.startsWith('/create'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Software Template',
        templateNamespace: parts[2],
        templateName: parts[4],
      };
      break;
    }

    case pathname.startsWith('/settings'):
      payload = { page: 'Settings' };
      break;

    case pathname === '/installations':
      payload = { page: 'Installations index' };
      break;

    case pathname === '/clusters':
      payload = { page: 'Clusters index' };
      break;

    case pathname.startsWith('/clusters'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Cluster details',
        installation: parts[2],
        clusterNamespace: parts[3],
        clusterName: parts[4],
        tab: parts[5] ?? 'overview',
      };
      break;
    }

    case pathname === '/deployments':
      payload = { page: 'Deployments index' };
      break;

    case pathname.startsWith('/deployments'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Deployment details',
        installation: parts[2],
        deploymentKind: parts[3],
        deploymentNamespace: parts[4],
        deploymentName: parts[5],
        tab: parts[6] ?? 'overview',
      };
      break;
    }

    case pathname === '/flux':
      payload = { page: 'Flux index' };
      break;

    case pathname.startsWith('/flux'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Flux',
        view: parts[2],
      };
      break;
    }

    case pathname === '/ai-chat':
      payload = { page: 'AI Chat' };
      break;

    case pathname === '/search':
      payload = { page: 'Search' };
      break;

    default:
      payload = { page: 'Unknown page' };
  }

  return {
    ...payload,
    path: pathname,
  };
}

export function getGuestUserEntityRef(profile: {
  email?: string;
  displayName?: string;
}): string {
  const userHash = sha256(
    profile.email ?? profile.displayName ?? '',
  ).toString();

  return `user:default/guest#${userHash}`;
}
