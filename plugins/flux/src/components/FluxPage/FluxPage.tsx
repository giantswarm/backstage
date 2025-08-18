import { useOutlet } from 'react-router-dom';
import { DefaultFluxPage, DefaultFluxPageProps } from './DefaultFluxPage';

export function FluxPage(props: DefaultFluxPageProps) {
  const outlet = useOutlet();

  return outlet || <DefaultFluxPage {...props} />;
}
