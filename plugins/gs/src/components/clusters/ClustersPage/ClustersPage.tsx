import { useOutlet } from 'react-router-dom';
import {
  DefaultClustersPage,
  DefaultClustersPageProps,
} from './DefaultClustersPage';

export function ClustersPage(props: DefaultClustersPageProps) {
  const outlet = useOutlet();

  return outlet || <DefaultClustersPage {...props} />;
}
