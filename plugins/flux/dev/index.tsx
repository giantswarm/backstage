import { createDevApp } from '@backstage/dev-utils';
import { FluxPage } from '../src/components/FluxPage';

createDevApp()
  .addPage({
    element: <FluxPage />,
    title: 'Root Page',
    path: '/flux',
  })
  .render();
