import { useOutlet } from 'react-router-dom';
import {
  DefaultFluxResourcesPage,
  DefaultFluxResourcesPageProps,
} from './DefaultFluxResourcesPage';

export function FluxResourcesPage(props: DefaultFluxResourcesPageProps) {
  const outlet = useOutlet();

  return outlet || <DefaultFluxResourcesPage {...props} />;
}
