import { Flex, Text } from '@backstage/ui';
import {
  joinNames,
  NAMED_IN_SENTENCE,
  SimpleAccordion,
} from '@giantswarm/backstage-plugin-ui-react';

export type NotReachableInstallationsNoteProps = {
  /** Installations the backend reports as not reachable from this portal. */
  installations: string[];
};

/**
 * A quiet, one-line note naming the installations whose kagent endpoint the
 * portal cannot reach -- learned from the backend's unauthenticated probe, so
 * nothing was tried on the user's behalf and there is nothing to retry.
 *
 * Deliberately not a warning card: on a fleet with private management
 * clusters this is the normal state of some installations, not a failure of
 * the page, and the rows from every other installation are complete. The
 * warning card (`UnreachableInstallationsAlert`) stays for installations that
 * were queried and could not be read. Renders nothing when the list is empty.
 *
 * Past {@link NAMED_IN_SENTENCE} installations the line names the first few
 * and counts the rest, with the whole list behind a disclosure.
 */
export function NotReachableInstallationsNote({
  installations,
}: NotReachableInstallationsNoteProps) {
  if (installations.length === 0) {
    return null;
  }
  const line = (
    <Text variant="body-small" color="secondary">
      {joinNames(installations)}: not reachable from this portal
    </Text>
  );
  if (installations.length <= NAMED_IN_SENTENCE) {
    return line;
  }
  return (
    <Flex direction="column" gap="1">
      {line}
      <SimpleAccordion
        title={`All ${installations.length} environments not reachable`}
        headingLevel={4}
      >
        <Text variant="body-small" color="secondary">
          {installations.join(', ')}
        </Text>
      </SimpleAccordion>
    </Flex>
  );
}
