import { Box, Flex, Text } from '@backstage/ui';
import { AsyncValue } from '../AsyncValue';
import { ErrorStatus } from '../ErrorStatus';
import { ExternalLink } from '../ExternalLink';
import { GitOpsIcon } from './GitOpsIcon';

export type GitOpsManagedLabelProps = {
  /**
   * A link to the resource's definition in Git, and how its lookup is going.
   *
   * Omit the prop entirely when the caller has no Git source to offer — the
   * label then renders on its own with no trailing slot. This component holds
   * no GitOps logic: deciding whether a resource is in Git, and finding where,
   * is the caller's job.
   */
  source?: {
    url?: string;
    isLoading: boolean;
    errorMessage?: string;
  };
};

/**
 * "Managed through GitOps", optionally followed by a link to the resource's
 * definition in Git.
 *
 * The portal's one way of saying a resource's desired state lives in Git and is
 * therefore not editable in place. Shared so that a Flux-reconciled resource and
 * one whose provenance is read off plain labels make the same claim in the same
 * words, with the same icon.
 */
export const GitOpsManagedLabel = ({ source }: GitOpsManagedLabelProps) => (
  <Flex align="center" gap="3">
    <GitOpsIcon />
    <Text variant="body-medium">Managed through GitOps</Text>
    {source && (
      // Reserved width so the resolving skeleton does not shift the label.
      <Box minWidth="75px">
        <AsyncValue
          isLoading={source.isLoading}
          value={source.url}
          errorMessage={source.errorMessage}
          renderError={message => (
            <ErrorStatus errorMessage={message} notAvailable={false} />
          )}
        >
          {url => (
            <Flex align="center" gap="2">
              <Text variant="body-medium">·</Text>
              <ExternalLink href={url}>Source</ExternalLink>
            </Flex>
          )}
        </AsyncValue>
      </Box>
    )}
  </Flex>
);
