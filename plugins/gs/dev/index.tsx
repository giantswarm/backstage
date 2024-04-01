import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { gsPlugin, GSClustersPage } from '../src/plugin';

createDevApp()
  .registerPlugin(gsPlugin)
  .addPage({
    element: <GSClustersPage />,
    title: 'Giant Swarm plugin',
    path: '/gs',
  })
  .render();
