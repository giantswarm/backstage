import React from 'react';
import { Card, CardContent } from '@material-ui/core';
import GitHubIcon from '@material-ui/icons/GitHub';
import MenuBookIcon from '@material-ui/icons/MenuBook';
import { Toolkit } from '../../UI';
import { BackstageIcon } from '../../../assets/icons/CustomIcons';

const resources = [
  {
    url: 'https://docs.giantswarm.io',
    label: 'Giant Swarm Docs',
    icon: <MenuBookIcon />,
  },
  {
    url: 'https://github.com/giantswarm',
    label: 'Giant Swarm GitHub',
    icon: <GitHubIcon />,
  },
  {
    url: 'https://github.com/giantswarm/backstage/releases',
    label: 'Backstage changelog',
    icon: <BackstageIcon />,
  },
];

export function ResourcesCard() {
  return (
    <Card>
      <CardContent>
        <Toolkit tools={resources} />
      </CardContent>
    </Card>
  );
}
