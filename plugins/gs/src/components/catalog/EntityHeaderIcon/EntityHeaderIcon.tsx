import { useAsyncEntity } from '@backstage/plugin-catalog-react';
import { getIconUrlFromEntity } from '../../utils/entity';

/**
 * Renders a custom icon in the entity page header.
 * Used via EntityHeaderBlueprint — the NFS entity page renders this
 * element natively in the header (no DOM portal needed).
 */
export const EntityHeaderIcon = () => {
  const { entity } = useAsyncEntity();
  const iconUrl = entity ? getIconUrlFromEntity(entity) : undefined;

  if (!iconUrl) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 64,
        height: 64,
        borderRadius: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        marginRight: 16,
        flexShrink: 0,
      }}
    >
      <img
        src={iconUrl}
        alt=""
        style={{
          width: 50,
          height: 50,
          objectFit: 'contain',
        }}
      />
    </div>
  );
};
