import { statusCheckHandler } from '@backstage/backend-common';
import {
  coreServices,
  createServiceFactory,
  createServiceRef,
} from '@backstage/backend-plugin-api';

export default createServiceFactory({
  service: createServiceRef({ id: 'internal.status-check', scope: 'root' }),
  deps: {
    http: coreServices.rootHttpRouter,
  },
  async factory({ http }) {
    http.use('/healthcheck', await statusCheckHandler());
  },
});
