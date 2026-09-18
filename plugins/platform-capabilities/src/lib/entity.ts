import { Entity } from '@backstage/catalog-model';

/** A catalog `Resource` of `spec.type: installation`: one installation of the registry. */
export function isInstallationEntity(entity: Entity): boolean {
  return (
    entity.kind.toLowerCase() === 'resource' &&
    (entity.spec?.type as string | undefined)?.toLowerCase() === 'installation'
  );
}
