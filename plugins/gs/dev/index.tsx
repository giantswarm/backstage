import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { gsPlugin, GSPluginPage } from '../src/plugin';

createDevApp()
  .registerPlugin(gsPlugin)
  .addPage({
    element: <GSPluginPage />,
    title: 'Giant Swarm plugin',
    path: '/gs',
  })
  .render();
