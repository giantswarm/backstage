import { useMemo } from 'react';
import { Flex, Text } from '@backstage/ui';
import {
  ShellPage,
  StackedRowList,
  type StackedRowItem,
} from '@giantswarm/backstage-plugin-ui-react';
import type { MCPServer } from '../../../lib/k8s';
import {
  mcpServerDisplayNames,
  serverRowDisplayName,
  singularServerPageKey,
} from '../../../lib/serverGrouping';
import { ConnectorLogo } from '../../ConnectorLogo';
import { useConnectorListPaths } from '../../shared';
import { useServerPageLinks } from '../../shared/useServerPageLinks';

export interface ConnectorNameChoiceProps {
  /** The name the address carries, `<installation>/<name>`. */
  name: string;
  installation: string;
  /** The organizations' connectors of that name, each with its own page. */
  named: readonly MCPServer[];
  /** The installation's servers, which the display names are read against. */
  servers: readonly MCPServer[];
}

/**
 * What a connector address of a name alone (`<installation>/<name>`) shows
 * where several organizations each own a connector of that name: each one,
 * linking to its own page (`-/<namespace>/<name>`). The address an
 * organization's connector had before it had its own.
 */
export function ConnectorNameChoice({
  name,
  installation,
  named,
  servers,
}: ConnectorNameChoiceProps) {
  const paths = useConnectorListPaths();
  const links = useServerPageLinks();
  const rows = useMemo<StackedRowItem[]>(() => {
    const names = mcpServerDisplayNames(servers);
    return named.map(server => {
      const displayName = serverRowDisplayName(
        { kind: 'server', server },
        names,
      );
      const key = singularServerPageKey(server);
      return {
        id: key,
        title: displayName,
        href: links.server(key, installation),
        leading: (
          <ConnectorLogo
            name={displayName}
            icon={server.getStatusIcon()}
            size={32}
            decorative
          />
        ),
        facts: [`Namespace ${server.getNamespace()}`],
      };
    });
  }, [named, servers, links, installation]);

  return (
    <ShellPage
      title={name}
      breadcrumbs={[
        { label: 'Customize', href: paths.customize },
        { label: 'Connectors', href: paths.connectors },
        { label: name },
      ]}
    >
      <Flex direction="column" gap="3">
        <Text as="p" variant="body-medium">
          {`${named.length} organizations on ${installation} each have a connector named “${name}”. Open the one you are looking for:`}
        </Text>
        <StackedRowList rows={rows} aria-label={`Connectors named ${name}`} />
      </Flex>
    </ShellPage>
  );
}
