import type { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import { CopyButton } from '@giantswarm/backstage-plugin-ui-react';

import type { ServingBackend } from '../../lib/serving';
import type { ServedModelGroup } from './ServedModelsTable';

/** Human labels for the backends, for the group headers and tooltips. */
export const BACKEND_LABEL: Record<ServingBackend, string> = {
  kserve: 'KServe',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  lemonade: 'Lemonade',
};

/**
 * Backend and runtime of a group in one phrase: `Ollama 0.33.2` (Ollama names
 * itself in its runtime string, so the backend label is not repeated),
 * `KServe · kserve-vllm` (the ServingRuntime every row of the group uses), or
 * just `KServe` when the rows run on several runtimes — or none reported yet
 * — and the runtime is a column instead.
 */
export function describeGroup(
  group: Pick<ServedModelGroup, 'backend' | 'runtime'>,
): string {
  const backend = BACKEND_LABEL[group.backend];
  if (!group.runtime) {
    return backend;
  }
  if (group.runtime.toLowerCase().startsWith(`${group.backend} `)) {
    return `${backend}${group.runtime.slice(group.backend.length)}`;
  }
  return `${backend} · ${group.runtime}`;
}

/**
 * Icon-only "copy this endpoint" control. The URL is what a client base URL
 * is set to, so it is worth a click, not a column: a group of Ollama models
 * shares one, an LLMInferenceService has its own.
 */
export function CopyEndpointButton({ url }: { url: string }) {
  // The endpoint is not shown elsewhere, so the tooltip names it.
  return (
    <CopyButton text={url} label="Copy endpoint" tooltip={`Copy ${url}`} />
  );
}

export type ServedModelsGroupHeaderProps = {
  group: ServedModelGroup;
  /**
   * Whether the header names the installation. The table sets it when it
   * lists more than one; with a single installation the backend leads.
   */
  showInstallation: boolean;
  /**
   * What trails the header: the backend's source and its own actions
   * (Remove backend) where the group is a backend registered with a
   * model-manager. Rendered after the endpoint, pushed to the end.
   */
  actions?: ReactNode;
};

/**
 * The line above a group's rows carrying what every row of the group shares
 * and therefore left the grid: the installation (when the table shows more
 * than one), the backend with its runtime version, and the endpoint they all
 * answer on — an Ollama host — with a copy action. A group whose rows have
 * their own endpoints (LLMInferenceServices) shows none here; each row carries
 * its own copy action instead. `actions` trails it all.
 */
export function ServedModelsGroupHeader({
  group,
  showInstallation,
  actions,
}: ServedModelsGroupHeaderProps) {
  const description = describeGroup(group);
  return (
    <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
      <Text as="h3" variant="title-x-small" weight="bold">
        {showInstallation ? group.installation : description}
      </Text>
      {showInstallation && (
        <Text as="span" variant="body-medium" color="secondary">
          {description}
        </Text>
      )}
      {group.endpoint && (
        // `minWidth: 0` on the row and the text, or the truncation never
        // engages: a flex item is as wide as its content by default, and a
        // long `…svc.cluster.local:11434` widened the whole card past a
        // phone's width (T22 C21). The copy action carries the full URL.
        <Flex
          align="center"
          gap="1"
          style={{ minWidth: 0, maxWidth: '100%' }}
          data-testid="served-models-group-endpoint"
        >
          <Text
            as="span"
            variant="body-medium"
            color="secondary"
            truncate
            title={group.endpoint}
            style={{ minWidth: 0 }}
          >
            {group.endpoint}
          </Text>
          <CopyEndpointButton url={group.endpoint} />
        </Flex>
      )}
      {actions && <span style={{ marginLeft: 'auto' }}>{actions}</span>}
    </Flex>
  );
}
