import {
  Entity,
  RELATION_HAS_PART,
  RELATION_PART_OF,
  parseEntityRef,
} from '@backstage/catalog-model';
import {
  EntityCardBlueprint,
  EntityRelationCard,
  entityColumnPresets,
} from '@backstage/plugin-catalog-react/alpha';

function hasRelation(entity: Entity, type: string, kind: string): boolean {
  return (entity.relations ?? []).some(rel => {
    if (rel.type !== type) return false;
    const ref = parseEntityRef(rel.targetRef);
    return ref.kind.toLowerCase() === kind.toLowerCase();
  });
}

function isEligibleComponent(entity: Entity): boolean {
  return entity.kind === 'Component';
}

function SubcomponentOfCard() {
  return (
    <EntityRelationCard
      title="Subcomponent of"
      entityKind="Component"
      relationType={RELATION_PART_OF}
      columnConfig={entityColumnPresets.component.columns}
    />
  );
}

function SubcomponentsOfCard() {
  return (
    <EntityRelationCard
      title="Has subcomponents"
      entityKind="Component"
      relationType={RELATION_HAS_PART}
      columnConfig={entityColumnPresets.component.columns}
    />
  );
}

export const SubcomponentOfEntityCard = EntityCardBlueprint.make({
  name: 'subcomponent-of',
  params: {
    type: 'content',
    filter: entity =>
      isEligibleComponent(entity) &&
      hasRelation(entity, RELATION_PART_OF, 'Component'),
    loader: async () => <SubcomponentOfCard />,
  },
});

export const SubcomponentsOfEntityCard = EntityCardBlueprint.make({
  name: 'subcomponents-of',
  params: {
    type: 'content',
    filter: entity =>
      isEligibleComponent(entity) &&
      hasRelation(entity, RELATION_HAS_PART, 'Component'),
    loader: async () => <SubcomponentsOfCard />,
  },
});
