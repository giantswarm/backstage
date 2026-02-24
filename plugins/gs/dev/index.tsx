import { createDevApp } from '@backstage/dev-utils';
import { gsScaffolderPlugin } from '../src/scaffolderPlugin';

createDevApp()
  .registerPlugin(gsScaffolderPlugin)
  .addPage({
    element: <div>Giant Swarm plugin (pages are NFS blueprints)</div>,
    title: 'Giant Swarm plugin',
    path: '/gs',
  })
  .render();
