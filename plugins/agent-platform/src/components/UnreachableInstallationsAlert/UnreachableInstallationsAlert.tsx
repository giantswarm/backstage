import { Alert, Flex, Text } from '@backstage/ui';
import {
  groupNames,
  joinNames,
  NAMED_IN_SENTENCE,
  SimpleAccordion,
} from '@giantswarm/backstage-plugin-ui-react';
import type { ReadFailure } from '../../lib/readFailure';

export type UnreachableInstallationsAlertProps = {
  /** Installations whose kagent resources couldn't be read. */
  installations: string[];
  /**
   * The resource being listed, used in the explanation (e.g. "ModelConfigs",
   * "Agents"). Defaults to a generic "kagent resources".
   */
  resourceName?: string;
  /**
   * Why each installation could not be read. When given, the banner names the
   * reason and request id per installation instead of guessing at both.
   */
  failures?: Record<string, ReadFailure>;
};

/**
 * Warning card listing installations that were skipped because their kagent
 * resources couldn't be read (unreachable, or the user lacks permission).
 * Shared by the create flow (installation select) and the agents list so the two
 * surfaces report partial-fleet failures identically. Renders nothing when the
 * list is empty.
 *
 * Up to {@link NAMED_IN_SENTENCE} installations are named one by one, with
 * their reason and request id. Past that the sentence groups them by reason
 * and names the first few of each (`a, b, c, d, e and 40 more (timed out)`),
 * and every installation — with its request id — sits behind a disclosure: a
 * private fleet of 50 is otherwise a wall of text.
 */
export function UnreachableInstallationsAlert({
  installations,
  resourceName = 'kagent resources',
  failures,
}: UnreachableInstallationsAlertProps) {
  if (installations.length === 0) {
    return null;
  }

  const count = installations.length;
  const title = `Couldn't read ${count} environment${count === 1 ? '' : 's'}`;

  if (count <= NAMED_IN_SENTENCE) {
    return (
      <Alert
        status="warning"
        title={title}
        description={
          failures
            ? `Skipped because their ${resourceName} couldn't be read: ${installations
                .map(installation =>
                  describe(installation, failures[installation]),
                )
                .join('; ')}.`
            : `Skipped because their ${resourceName} couldn't be read — the environment may be unreachable, or you may not have permission to list ${resourceName} there: ${installations.join(
                ', ',
              )}.`
        }
      />
    );
  }

  const sentence = failures
    ? `Skipped because their ${resourceName} couldn't be read: ${groupNames(
        installations,
        installation => installation,
        installation => failures[installation]?.reason ?? '',
      )
        .map(({ group, names }) =>
          group ? `${joinNames(names)} (${group})` : joinNames(names),
        )
        .join('; ')}.`
    : `Skipped because their ${resourceName} couldn't be read — the environment may be unreachable, or you may not have permission to list ${resourceName} there: ${joinNames(
        installations,
      )}.`;

  return (
    <Alert
      status="warning"
      title={title}
      description={
        <Flex direction="column" gap="2">
          <span>{sentence}</span>
          <SimpleAccordion title={`All ${count} environments`} headingLevel={4}>
            <Flex direction="column" gap="1">
              {installations.map(installation => (
                <Text key={installation} variant="body-small">
                  {failures
                    ? describe(installation, failures[installation])
                    : installation}
                </Text>
              ))}
            </Flex>
          </SimpleAccordion>
        </Flex>
      }
    />
  );
}

/** `gremlin (timed out, request id 3f2c…)`, or the bare name with no failure. */
function describe(installation: string, failure: ReadFailure | undefined) {
  if (!failure) {
    return installation;
  }
  const requestId = failure.requestId
    ? `, request id ${failure.requestId}`
    : '';
  return `${installation} (${failure.reason}${requestId})`;
}
