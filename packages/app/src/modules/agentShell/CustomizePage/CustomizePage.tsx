import { Helmet } from 'react-helmet';
import {
  configApiRef,
  RouteRef,
  SubRouteRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { ButtonLink, Container, Flex, Grid, Link, Text } from '@backstage/ui';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import {
  agentPlatformPlugin,
  ServingLayerGate,
} from '@giantswarm/backstage-plugin-agent-platform';
import musterPlugin from '@giantswarm/backstage-plugin-muster';

type AreaRouteRef = RouteRef<undefined> | SubRouteRef<undefined>;

type CreateLink = { label: string; routeRef: AreaRouteRef };

type CustomizeArea = {
  id: string;
  title: string;
  description: string;
  routeRef: AreaRouteRef;
  create?: CreateLink;
  /** Shown only where the Models tab offers its Serving view. */
  needsServingLayer?: boolean;
};

const areas: CustomizeArea[] = [
  {
    id: 'agents',
    title: 'Agents',
    description:
      'The agents you start sessions with, and the model, tools and skills each one runs on.',
    routeRef: agentPlatformPlugin.routes.agents,
    create: {
      label: 'New agent',
      routeRef: agentPlatformPlugin.routes.newAgent,
    },
  },
  {
    id: 'models',
    title: 'Models',
    description: 'The model configurations agents can run on.',
    routeRef: agentPlatformPlugin.routes.models,
    create: {
      label: 'Add model',
      routeRef: agentPlatformPlugin.routes.newModel,
    },
  },
  {
    id: 'model-hosting',
    title: 'Model hosting',
    description: 'The models served on your installations and their status.',
    routeRef: agentPlatformPlugin.routes.serving,
    needsServingLayer: true,
  },
  {
    id: 'mcp-servers',
    title: 'MCP servers',
    description: 'The MCP servers that give agents their tools.',
    routeRef: musterPlugin.routes.mcpServers,
    create: {
      label: 'Register server',
      routeRef: musterPlugin.routes.newMcpServer,
    },
  },
  {
    id: 'workflows',
    title: 'Workflows',
    description:
      'Multi-step tool sequences that muster offers to agents as a single tool.',
    routeRef: musterPlugin.routes.workflows,
  },
];

function CreateAction({ label, routeRef }: CreateLink) {
  const link = useRouteRef(routeRef);
  if (!link) {
    return null;
  }
  return (
    <ButtonLink href={link()} variant="secondary" size="small">
      {label}
    </ButtonLink>
  );
}

function AreaCard({ area }: { area: CustomizeArea }) {
  const link = useRouteRef(area.routeRef);
  if (!link) {
    return null;
  }
  return (
    <Grid.Item>
      <InfoCard
        titleAs="h2"
        title={<Link href={link()}>{area.title}</Link>}
        footerActions={area.create && <CreateAction {...area.create} />}
      >
        <Text as="p" variant="body-medium" color="secondary">
          {area.description}
        </Text>
      </InfoCard>
    </Grid.Item>
  );
}

export function CustomizePage() {
  const appTitle =
    useApi(configApiRef).getOptionalString('app.title') ?? 'Backstage';
  return (
    <Container py="8">
      <Helmet title="Customize" titleTemplate={`%s | ${appTitle}`} />
      <Flex direction="column" gap="6">
        <Flex direction="column" gap="2">
          <Text as="h1" variant="title-large">
            Customize
          </Text>
          <Text as="p" variant="body-large" color="secondary">
            The agents, models, tools and workflows behind your sessions.
          </Text>
        </Flex>
        <Grid.Root columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
          {areas.map(area =>
            area.needsServingLayer ? (
              <ServingLayerGate key={area.id}>
                <AreaCard area={area} />
              </ServingLayerGate>
            ) : (
              <AreaCard key={area.id} area={area} />
            ),
          )}
        </Grid.Root>
      </Flex>
    </Container>
  );
}
