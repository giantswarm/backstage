import { Entity, getEntitySourceLocation } from '@backstage/catalog-model';

function extractGitHubOrgName(url: string): string | null {
  const match = url.match(/^https:\/\/github\.com\/([^\/]+)\/[^\/]+/);
  return match ? match[1] : null;
}

export function isGSService(entity: Entity): boolean {
  if (entity.spec?.type !== 'service') {
    return false;
  }

  const sourceLocation = getEntitySourceLocation(entity);
  const orgName = extractGitHubOrgName(sourceLocation.target);
  if (!orgName) {
    return false;
  }

  return orgName === 'giantswarm';
}
