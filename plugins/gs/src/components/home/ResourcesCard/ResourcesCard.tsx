import React from 'react';
import { Card, CardContent, Typography } from '@material-ui/core';
import GitHubIcon from '@material-ui/icons/GitHub';
import MenuBookIcon from '@material-ui/icons/MenuBook';
import { Toolkit } from '../../UI';
import { BackstageIcon } from '../../../assets/icons/CustomIcons';

const resources = [
  {
    url: 'https://docs.giantswarm.io',
    label: (
      <>
        <Typography variant="inherit">Giant Swarm</Typography>
        <br />
        <Typography variant="inherit">Docs</Typography>
      </>
    ),
    icon: <MenuBookIcon />,
  },
  {
    url: 'https://github.com/giantswarm',
    label: (
      <>
        <Typography variant="inherit">Giant Swarm</Typography>
        <br />
        <Typography variant="inherit">GitHub</Typography>
      </>
    ),
    icon: <GitHubIcon />,
  },
  {
    url: 'https://github.com/giantswarm/backstage/releases',
    label: (
      <>
        <Typography variant="inherit">Backstage</Typography>
        <br />
        <Typography variant="inherit">changelog</Typography>
      </>
    ),
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
