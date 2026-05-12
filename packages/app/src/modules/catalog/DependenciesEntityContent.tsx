import {
  EntityContentBlueprint,
  EntityRelationCard,
  entityColumnPresets,
} from '@backstage/plugin-catalog-react/alpha';
import { useEntity } from '@backstage/plugin-catalog-react';
import Grid from '@material-ui/core/Grid';
import Link from '@material-ui/core/Link';
import Typography from '@material-ui/core/Typography';
import {
  Entity,
  RELATION_DEPENDENCY_OF,
  RELATION_DEPENDS_ON,
  RELATION_HAS_PART,
  RELATION_PART_OF,
  parseEntityRef,
} from '@backstage/catalog-model';
import {
  EntityDependencyOfComponentsCard,
  EntityDependsOnComponentsCard,
  EntityHasSubcomponentsCard,
} from '@backstage/plugin-catalog';

function hasRelation(entity: Entity, type: string, kind: string): boolean {
  return (entity.relations ?? []).some(rel => {
    if (rel.type !== type) return false;
    const ref = parseEntityRef(rel.targetRef);
    return ref.kind.toLowerCase() === kind.toLowerCase();
  });
}

function DependenciesContent() {
  const { entity } = useEntity();
  const title = entity.metadata.title ?? entity.metadata.name;
  const projectSlug = entity.metadata.annotations?.['github.com/project-slug'];
  const depsUrl = projectSlug
    ? `https://github.com/${projectSlug}/network/dependencies`
    : undefined;

  const showPartOfSystem = hasRelation(entity, RELATION_PART_OF, 'System');
  const showSubcomponentOf = hasRelation(entity, RELATION_PART_OF, 'Component');
  const showHasSubcomponents = hasRelation(
    entity,
    RELATION_HAS_PART,
    'Component',
  );
  const showDependsOn = hasRelation(entity, RELATION_DEPENDS_ON, 'Component');
  const showDependencyOf = hasRelation(
    entity,
    RELATION_DEPENDENCY_OF,
    'Component',
  );

  const hasAnyRelation =
    showPartOfSystem ||
    showSubcomponentOf ||
    showHasSubcomponents ||
    showDependsOn ||
    showDependencyOf;

  if (!hasAnyRelation) {
    return (
      <Typography variant="body2">
        No dependencies or relationships found for {title} in the catalog.
        {depsUrl ? (
          <>
            {' '}
            Use the{' '}
            <Link href={depsUrl} target="_blank" rel="noopener noreferrer">
              GitHub dependencies page
            </Link>{' '}
            for an overview of code-level dependencies.
          </>
        ) : null}
      </Typography>
    );
  }

  return (
    <Grid container spacing={3} alignItems="stretch">
      <Grid item md={12}>
        <Typography variant="body2">
          Here we show only dependencies that are also included in the catalog.
          {depsUrl ? (
            <>
              {' '}
              Use the{' '}
              <Link href={depsUrl} target="_blank" rel="noopener noreferrer">
                GitHub dependencies page
              </Link>{' '}
              for a more complete overview.
            </>
          ) : (
            <>
              {' '}
              Use the GitHub dependencies page under <b>Insights</b> /{' '}
              <b>Dependency graph</b> for a more complete overview.
            </>
          )}
        </Typography>
      </Grid>
      {showPartOfSystem && (
        <Grid item md={12}>
          <EntityRelationCard
            title="Part of"
            entityKind="System"
            relationType={RELATION_PART_OF}
            columnConfig={entityColumnPresets.system.columns}
            emptyState={{
              message: `${title} is not part of any system.`,
              helpLink: entityColumnPresets.system.helpLink,
            }}
          />
        </Grid>
      )}
      {showSubcomponentOf && (
        <Grid item md={12}>
          <EntityRelationCard
            title="Subcomponent of"
            entityKind="Component"
            relationType={RELATION_PART_OF}
            columnConfig={entityColumnPresets.component.columns}
            emptyState={{
              message: `${title} is not a subcomponent of another component.`,
              helpLink: entityColumnPresets.component.helpLink,
            }}
          />
        </Grid>
      )}
      {showHasSubcomponents && (
        <Grid item md={12}>
          <EntityHasSubcomponentsCard title={`Subcomponents of ${title}`} />
        </Grid>
      )}
      {showDependsOn && (
        <Grid item md={12}>
          <EntityDependsOnComponentsCard
            title={`Components ${title} depends on`}
          />
        </Grid>
      )}
      {showDependencyOf && (
        <Grid item md={12}>
          <EntityDependencyOfComponentsCard
            title={`Components depending on ${title}`}
          />
        </Grid>
      )}
    </Grid>
  );
}

export const DependenciesEntityContent = EntityContentBlueprint.make({
  name: 'dependencies',
  params: {
    path: '/dependencies',
    title: 'Dependencies',
    filter: entity =>
      entity.kind === 'Component' &&
      entity.spec?.type !== 'customer' &&
      entity.spec?.type !== 'template',
    loader: async () => <DependenciesContent />,
  },
});
