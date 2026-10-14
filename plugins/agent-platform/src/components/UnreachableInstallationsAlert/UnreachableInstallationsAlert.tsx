import { ReactNode, useState } from 'react';
import { Alert, ButtonIcon, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import CloseIcon from '@material-ui/icons/Close';
import {
  countNoun,
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

/** The guess at why, when the reads do not say: per one environment or several. */
const MAY_BE_UNREACHABLE = {
  one: 'The environment may be unreachable, or your account may lack permission there.',
  several:
    'The environments may be unreachable, or your account may lack permission there.',
};

export type UnreachableInstallationsAlertProps = {
  /** Installations whose kagent resources couldn't be read. */
  installations: string[];
  /**
   * The resource being listed, lower case, as it reads mid-sentence after
   * "The" (e.g. "agents", "served models"). Defaults to a generic "kagent
   * resources".
   */
  resourceName?: string;
  /**
   * Why each installation could not be read. When given, the banner names the
   * reason and request id per installation instead of guessing at both.
   */
  failures?: Record<string, ReadFailure>;
  /**
   * The list the warning is about is still being read and has nothing to show
   * yet — pass the condition of the list's own loading indicator. The warning
   * waits for it: one environment failing while the others are still being
   * read is not yet the list's answer. It stays mounted meanwhile, so a close
   * outlasts the list going back to loading.
   */
  isLoading?: boolean;
};

/**
 * Warning card naming the installations whose resources could not be read
 * (unreachable, or the user lacks permission); the list leaves them out.
 * Shared by the create flow (installation select) and the agents list so the two
 * surfaces report partial-fleet failures identically. Renders nothing when the
 * list is empty.
 *
 * Up to {@link NAMED_IN_SENTENCE} installations are named one by one, with
 * their reason and request id; one reads as one ("The sessions could not be
 * read on gremlin (timed out)."), since under a pinned scope it is the whole
 * view. Past that the sentence groups them by reason
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
  isLoading = false,
}: UnreachableInstallationsAlertProps) {
  // Above every early return: hiding the card while the list loads, or while
  // nothing failed, must not forget that it was closed.
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const key = installations.join('\n');

  if (isLoading || installations.length === 0 || closedKey === key) {
    return null;
  }
  const onClose = () => setClosedKey(key);

  const count = installations.length;
  const title = `Could not read ${countNoun(count, 'environment')}`;

  if (count <= NAMED_IN_SENTENCE) {
    return (
      <ClosableWarning
        title={title}
        onClose={onClose}
        description={describeFew(installations, resourceName, failures)}
      />
    );
  }

  const sentence = failures
    ? `The ${resourceName} could not be read on these environments: ${groupNames(
        installations,
        installation => installation,
        installation => failures[installation]?.reason ?? '',
      )
        .map(({ group, names }) =>
          group ? `${joinNames(names)} (${group})` : joinNames(names),
        )
        .join('; ')}.`
    : `The ${resourceName} on ${joinNames(
        installations,
      )} could not be read. ${MAY_BE_UNREACHABLE.several}`;

  return (
    <ClosableWarning
      title={title}
      onClose={onClose}
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

/** `a`, `a and b`, `a, b and c`: up to {@link NAMED_IN_SENTENCE} names. */
function listNames(names: string[]): string {
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The sentence for up to {@link NAMED_IN_SENTENCE} environments, each named:
 * one environment reads as one, so a single pinned environment is not told
 * about "their" reads or what was "skipped". A failure's reason and request
 * id follow its environment; past one, the entries are a semicolon list,
 * because a reason holds commas.
 */
function describeFew(
  installations: string[],
  resourceName: string,
  failures: Record<string, ReadFailure> | undefined,
): string {
  if (installations.length === 1) {
    const [installation] = installations;
    if (!failures) {
      return `The ${resourceName} on ${installation} could not be read. ${MAY_BE_UNREACHABLE.one}`;
    }
    return `The ${resourceName} could not be read on ${describe(
      installation,
      failures[installation],
    )}.`;
  }
  if (!failures) {
    return `The ${resourceName} on ${listNames(
      installations,
    )} could not be read. ${MAY_BE_UNREACHABLE.several}`;
  }
  return `The ${resourceName} could not be read on these environments: ${installations
    .map(installation => describe(installation, failures[installation]))
    .join('; ')}.`;
}

/** The warning card with its close button, announced as an alert. */
function ClosableWarning({
  title,
  description,
  onClose,
}: {
  title: string;
  description: ReactNode;
  onClose: () => void;
}) {
  const classes = useStyles();

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
          onPress={onClose}
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
