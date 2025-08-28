import { useOutlet } from 'react-router-dom';
import { DefaultFluxPage } from '@giantswarm/backstage-plugin-flux-react';

export function FluxPage() {
  const outlet = useOutlet();

  return outlet || <DefaultFluxPage />;
}
