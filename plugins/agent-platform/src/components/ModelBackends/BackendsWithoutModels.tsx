import type { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';

import type { RegisteredBackend } from '../../hooks/useModelManagerBackends';
import { ServedModelsGroupHeader } from '../ServingPage/ServedModelsGroupHeader';

export type BackendsWithoutModelsProps = {
  /** Registered backends the Serving table has no group for. */
  backends: RegisteredBackend[];
  /** Whether the rows name the installation (the table lists several). */
  showInstallation: boolean;
  /** The row's trailing part: the backend's source and Remove backend. */
  renderActions: (backend: RegisteredBackend) => ReactNode;
};

/**
 * The registered backends that serve nothing yet — a KServe without a pool,
 * an Ollama before its first pull — as rows of their own below the served
 * models, each with the same header a group has (backend and version,
 * endpoint, source, Remove backend), so a backend that never gets a model
 * can still be removed from where it was registered.
 */
export function BackendsWithoutModels({
  backends,
  showInstallation,
  renderActions,
}: BackendsWithoutModelsProps) {
  if (backends.length === 0) {
    return null;
  }
  return (
    <Flex direction="column" gap="3" data-testid="backends-without-models">
      <Text as="h2" variant="title-small" weight="bold">
        Backends without models
      </Text>
      {backends.map(backend => (
        <Flex
          key={`${backend.installation}/${backend.kind}`}
          direction="column"
          gap="1"
          data-testid={`backend-without-models-${backend.kind}`}
        >
          <ServedModelsGroupHeader
            group={{
              key: `${backend.installation}/${backend.kind}`,
              installation: backend.installation,
              backend: backend.kind,
              rows: [],
              runtime: backend.version
                ? `${backend.kind} ${backend.version}`
                : undefined,
              endpoint: backend.endpoint,
            }}
            showInstallation={showInstallation}
            actions={renderActions(backend)}
          />
          <Text as="p" variant="body-small" color="secondary">
            {backend.healthy === false && backend.message
              ? `Not healthy: ${backend.message}`
              : 'No models served yet — serve or pull one, or remove the backend.'}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}
