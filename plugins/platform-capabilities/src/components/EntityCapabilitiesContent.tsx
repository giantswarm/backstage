import { Alert, Flex, Text } from '@backstage/ui';
import { useEntity } from '@backstage/plugin-catalog-react';
import { ActionHistory } from './ActionHistory';
import { CapabilityCard } from './CapabilityCard';
import { ErrorAlert } from './ErrorAlert';
import { Loading } from './Loading';
import { PlatformCapabilitiesProviders } from './Providers';
import { useInstallations, useManagerInfo } from './queries';

function Capabilities({ name }: { name: string }) {
  const listing = useInstallations({ installations: [name] });
  const info = useManagerInfo();

  if (listing.isPending) {
    return <Loading label="Loading capabilities…" testId="loading" />;
  }
  if (listing.error) {
    return (
      <ErrorAlert
        title="giantswarm-platform-manager"
        error={listing.error as Error}
      />
    );
  }
  const installation = listing.data?.installations.find(i => i.name === name);
  if (!installation) {
    return (
      <Alert
        status="info"
        title="Not in the registry"
        description={`${name} is not an installation the platform manager knows.`}
      />
    );
  }
  return (
    <Flex direction="column" gap="4">
      {!installation.readable && (
        <Alert
          status="warning"
          title="Repositories not readable as you"
          description={
            (installation.errors ?? []).join('; ') ||
            "The installation's repositories could not be read with your grant."
          }
        />
      )}
      {installation.capabilities.map(capability => (
        <CapabilityCard
          key={capability.name}
          installation={installation}
          capability={capability}
          definition={info.data?.definitions.find(
            d => d.name === capability.name,
          )}
        />
      ))}
      {installation.capabilities.length === 0 && (
        <Text variant="body-small" color="secondary">
          The manager defines no capability.
        </Text>
      )}
      <ActionHistory installation={name} />
    </Flex>
  );
}

/**
 * The Capabilities tab of an installation: one block per platform capability
 * with its state from `list_installations`, the comparison with its
 * definition run as the tab opens, and one button opening the dialog; then
 * the action history -- everything through the manager's tools as the
 * signed-in person.
 */
export function EntityCapabilitiesContent() {
  const { entity } = useEntity();
  return (
    <PlatformCapabilitiesProviders>
      <Capabilities name={entity.metadata.name} />
    </PlatformCapabilitiesProviders>
  );
}
