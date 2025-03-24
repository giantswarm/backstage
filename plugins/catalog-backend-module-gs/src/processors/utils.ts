import { Entity, getEntitySourceLocation } from '@backstage/catalog-model';

const SERVICE_TYPE = 'service';
const GS_ORG_NAME = 'giantswarm';

function extractGitHubOrgName(url: string): string | null {
  const match = url.match(/^https:\/\/github\.com\/([^\/]+)\/[^\/]+/);
  return match ? match[1] : null;
}

export function isGSService(entity: Entity): boolean {
  if (entity.spec?.type !== SERVICE_TYPE) {
    return false;
  }

  const sourceLocation = getEntitySourceLocation(entity);
  const orgName = extractGitHubOrgName(sourceLocation.target);
  if (!orgName) {
    return false;
  }

  return orgName === GS_ORG_NAME;
}

export function formatVersion(version: string) {
  // Remove the `v` prefix if it's present.
  return version.startsWith('v') ? version.slice(1) : version;
}
