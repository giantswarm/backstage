import { useOutlet } from 'react-router-dom';
import { DefaultFluxPage } from './DefaultFluxPage';

export function FluxPage() {
  const outlet = useOutlet();

  return outlet || <DefaultFluxPage />;
}
