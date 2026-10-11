import { ReactNode, useState } from 'react';
import { Alert, ButtonIcon, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import CloseIcon from '@material-ui/icons/Close';
import {
  groupNames,
  joinNames,
  NAMED_IN_SENTENCE,
  SimpleAccordion,
} from '@giantswarm/backstage-plugin-ui-react';
import type { ReadFailure } from '../../lib/readFailure';

const useStyles = makeStyles({
  // The close button in the top-right corner, level with the title, rather
  // than centred on a card the installation list makes tall.
  alert: {
    '& .bui-AlertActions': {
      alignItems: 'flex-start',
      marginTop: 'calc(-1 * var(--bui-space-1))',
      marginRight: 'calc(-1 * var(--bui-space-1))',
    },
  },
});

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
 *
 * It sits on most of the shell's pages, so the person can close it (the
 * corner "X" of the dismissible banners, in bui Alert's actions slot). It
 * stays closed for this set of installations while the page is mounted; a
 * different set (a new failure) or the next visit shows it again.
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
  const title = `Could not read ${count} environment${count === 1 ? '' : 's'}`;

  if (count <= NAMED_IN_SENTENCE) {
    return (
      <ClosableWarning
        installations={installations}
        title={title}
        description={
          failures
            ? `Skipped because their ${resourceName} could not be read: ${installations
                .map(installation =>
                  describe(installation, failures[installation]),
                )
                .join('; ')}.`
            : `Skipped because their ${resourceName} could not be read — the environment may be unreachable, or you may not have permission to list ${resourceName} there: ${installations.join(
                ', ',
              )}.`
        }
      />
    );
  }

  const sentence = failures
    ? `Skipped because their ${resourceName} could not be read: ${groupNames(
        installations,
        installation => installation,
        installation => failures[installation]?.reason ?? '',
      )
        .map(({ group, names }) =>
          group ? `${joinNames(names)} (${group})` : joinNames(names),
        )
        .join('; ')}.`
    : `Skipped because their ${resourceName} could not be read — the environment may be unreachable, or you may not have permission to list ${resourceName} there: ${joinNames(
        installations,
      )}.`;

  return (
    <ClosableWarning
      installations={installations}
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

/**
 * The warning card with its close button. Announced as an alert; closing it
 * hides this set of installations' warning until the set changes.
 */
function ClosableWarning({
  installations,
  title,
  description,
}: {
  installations: string[];
  title: string;
  description: ReactNode;
}) {
  const classes = useStyles();
  const key = installations.join('\n');
  const [closedKey, setClosedKey] = useState<string | null>(null);

  if (closedKey === key) {
    return null;
  }

  return (
    <Alert
      role="alert"
      className={classes.alert}
      status="warning"
      title={title}
      description={description}
      customActions={
        <ButtonIcon
          variant="tertiary"
          size="small"
          icon={<CloseIcon fontSize="small" />}
          aria-label="Close"
          onPress={() => setClosedKey(key)}
        />
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
