import { useCallback, useEffect, useRef, useState } from 'react';
import { ButtonIcon, Flex, Text } from '@backstage/ui';
import CheckIcon from '@material-ui/icons/Check';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';

import type { ServingBackend } from '../../lib/serving';
import type { ServedModelGroup } from './ServedModelsTable';

/** Human labels for the backends, for the group headers and tooltips. */
export const BACKEND_LABEL: Record<ServingBackend, string> = {
  kserve: 'KServe',
  ollama: 'Ollama',
  lemonade: 'Lemonade',
};

/** How long the copy control shows its tick before reverting. */
const COPIED_MS = 1500;

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
 * shares one, an InferenceService has its own.
 */
export function CopyEndpointButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access refused (insecure context, permission): the URL is
      // in the tooltip to copy by hand.
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  }, [url]);

  return (
    <span
      title={copied ? 'Copied' : `Copy ${url}`}
      style={{ display: 'inline-flex' }}
    >
      <ButtonIcon
        size="small"
        variant="tertiary"
        aria-label={copied ? 'Endpoint copied' : 'Copy endpoint'}
        icon={copied ? <CheckIcon /> : <FileCopyOutlinedIcon />}
        onPress={copy}
      />
    </span>
  );
}

export type ServedModelsGroupHeaderProps = {
  group: ServedModelGroup;
  /**
   * Whether the header names the installation. The table sets it when it
   * lists more than one; with a single installation the backend leads.
   */
  showInstallation: boolean;
};

/**
 * The line above a group's rows carrying what every row of the group shares
 * and therefore left the grid: the installation (when the table shows more
 * than one), the backend with its runtime version, and the endpoint they all
 * answer on — an Ollama host — with a copy action. A group whose rows have
 * their own endpoints (InferenceServices) shows none here; each row carries
 * its own copy action instead.
 */
export function ServedModelsGroupHeader({
  group,
  showInstallation,
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
        <Flex align="center" gap="1">
          <Text
            as="span"
            variant="body-medium"
            color="secondary"
            truncate
            title={group.endpoint}
          >
            {group.endpoint}
          </Text>
          <CopyEndpointButton url={group.endpoint} />
        </Flex>
      )}
    </Flex>
  );
}
