import { createDevApp } from '@backstage/dev-utils';
import { fluxPlugin, FluxPage } from '../src/plugin';

createDevApp()
  .registerPlugin(fluxPlugin)
  .addPage({
    element: <FluxPage />,
    title: 'Root Page',
    path: '/flux',
  })
  .render();
