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
        <Typography variant="inherit">Portal</Typography>
        <br />
        <Typography variant="inherit">changelog</Typography>
      </>
    ),
    icon: <BackstageIcon />,
  },
  {
    url: 'https://github.com/orgs/giantswarm/projects/273/views/28?filterQuery=-status%3A%22Done+%E2%9C%85%22+kind%3A%22Epic+%F0%9F%8E%AF%22%2C%22Rock+%F0%9F%AA%A8%22%2C%22Feature+%F0%9F%92%AB%22+label%3Aui%2Fbackstage',
    label: (
      <>
        <Typography variant="inherit">Portal</Typography>
        <br />
        <Typography variant="inherit">roadmap</Typography>
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
