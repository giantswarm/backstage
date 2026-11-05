import { createApp } from '@backstage/frontend-defaults';
import { appFeatures, bindAppRoutes } from './appFeatures';

const app = createApp({
  features: appFeatures,
  bindRoutes: bindAppRoutes,
});

export default app.createRoot();
