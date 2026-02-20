import { createDevApp } from '@backstage/dev-utils';

createDevApp()
  .addPage({
    element: <div>Giant Swarm plugin (pages are NFS blueprints)</div>,
    title: 'Giant Swarm plugin',
    path: '/gs',
  })
  .render();
