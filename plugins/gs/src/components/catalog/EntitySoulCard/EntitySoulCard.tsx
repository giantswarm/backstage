import { useEntity } from '@backstage/plugin-catalog-react';
import { useKlausSoul } from '../../hooks/useKlausSoul';
import { QueryClientProvider } from '../../QueryClientProvider';
import { getKlausSoulUrlFromEntity } from '../../utils/entity';
import { CollapsibleMarkdownCard } from '../../UI';

const SoulCardContent = () => {
  const { entity } = useEntity();
  const soulUrl = getKlausSoulUrlFromEntity(entity);
  const { soul, isLoading, error } = useKlausSoul(soulUrl);

  return (
    <CollapsibleMarkdownCard
      title="Soul"
      content={soul}
      isLoading={isLoading}
      error={error}
      emptyMessage="No SOUL.md available."
      toggleLabels={{ expand: 'Show full SOUL', collapse: 'Show less' }}
    />
  );
};

export const EntitySoulCard = () => {
  return (
    <QueryClientProvider>
      <SoulCardContent />
    </QueryClientProvider>
  );
};
