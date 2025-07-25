import { Card, CardContent } from '@material-ui/core';
import { Toolkit } from '../../UI';
import { useApi, configApiRef } from '@backstage/core-plugin-api';

const defaultLinks = [
  {
    url: 'https://docs.giantswarm.io',
    label: 'Giant Swarm \n Docs',
    icon: 'MenuBook',
  },
  {
    url: 'https://github.com/giantswarm',
    label: 'Giant Swarm \n GitHub',
    icon: 'GitHub',
  },
  {
    url: 'https://github.com/giantswarm/backstage/releases',
    label: 'Portal \n changelog',
    icon: 'BackstageIcon',
  },
  {
    url: 'https://github.com/orgs/giantswarm/projects/273/views/28?filterQuery=-status%3A%22Done+%E2%9C%85%22+kind%3A%22Epic+%F0%9F%8E%AF%22%2C%22Rock+%F0%9F%AA%A8%22%2C%22Feature+%F0%9F%92%AB%22+label%3Aui%2Fbackstage',
    label: 'Portal \n roadmap',
    icon: 'BackstageIcon',
  },
];

export function ResourcesCard() {
  const configApi = useApi(configApiRef);

  const linksConfig = configApi.getOptionalConfigArray('gs.homepage.resources');

  const links = linksConfig
    ? linksConfig.map(link => ({
        url: link.getString('url'),
        label: link.getString('label'),
        icon: link.getString('icon'),
      }))
    : defaultLinks;

  return (
    <Card>
      <CardContent>
        <Toolkit tools={links} />
      </CardContent>
    </Card>
  );
}
