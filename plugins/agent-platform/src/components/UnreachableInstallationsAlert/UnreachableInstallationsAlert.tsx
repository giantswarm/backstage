import { ReactNode, useState } from 'react';
import { Alert, Button, ButtonIcon, Flex, Text } from '@backstage/ui';
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
  /**
   * What the failure means where the warning shows, as a sentence after the
   * description: in a form, "They are not offered for this agent."
   */
  consequence?: string;
  /**
   * Read the failed environments again: a "Try again" button beside the text.
   * For a list whose failure a retry can fix, as when kagent was down for a
   * moment.
   */
  onRetry?: () => void;
  /** The retry is under way: the button shows it and takes no second press. */
  isRetrying?: boolean;
  /**
   * Given when the failure is the whole list's answer, nothing else having
   * been read: a danger card under `title` ("Could not read your sessions"),
   * which the person cannot close, since closing it would leave a page that
   * looks empty. Without it, the closable warning.
   */
  everything?: { title: string };
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
 * different set (a new failure) or the next visit shows it again. A failure
 * that is the list's whole answer (`everything`) is a danger card instead,
 * which stays; with `onRetry` either card offers "Try again".
 */
export function UnreachableInstallationsAlert({
  installations,
  resourceName = 'kagent resources',
  failures,
  isLoading = false,
  consequence,
  onRetry,
  isRetrying = false,
  everything,
}: UnreachableInstallationsAlertProps) {
  // Above every early return: hiding the card while the list loads, or while
  // nothing failed, must not forget that it was closed.
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const key = installations.join('\n');

  // A closed warning does not hide the danger card: that one cannot be closed.
  if (
    isLoading ||
    installations.length === 0 ||
    (closedKey === key && !everything)
  ) {
    return null;
  }
  const onClose = () => setClosedKey(key);

  const count = installations.length;
  const title =
    everything?.title ?? `Could not read ${countNoun(count, 'environment')}`;
  const after = consequence ? ` ${consequence}` : '';
  const card = {
    title,
    onClose: everything ? undefined : onClose,
    status: everything ? ('danger' as const) : ('warning' as const),
    retry: onRetry ? { onRetry, isRetrying } : undefined,
  };

  if (count <= NAMED_IN_SENTENCE) {
    return (
      <ReadFailureCard
        {...card}
        description={`${describeFew(
          installations,
          resourceName,
          failures,
        )}${after}`}
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
    <ReadFailureCard
      {...card}
      description={
        <Flex direction="column" gap="2">
          <span>
            {sentence}
            {after}
          </span>
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

/**
 * The card, announced as an alert: a warning with its close button, or a
 * danger card without one; either with a "Try again" button when the list can
 * be read again.
 */
function ReadFailureCard({
  title,
  description,
  status,
  onClose,
  retry,
}: {
  title: string;
  description: ReactNode;
  status: 'warning' | 'danger';
  onClose?: () => void;
  retry?: { onRetry: () => void; isRetrying: boolean };
}) {
  const classes = useStyles();

  return (
    <Alert
      role="alert"
      className={classes.alert}
      status={status}
      title={title}
      description={description}
      customActions={
        retry || onClose ? (
          <Flex align="center" gap="1">
            {retry && (
              <Button
                variant="secondary"
                size="small"
                isPending={retry.isRetrying}
                onPress={retry.onRetry}
              >
                Try again
              </Button>
            )}
            {onClose && (
              <ButtonIcon
                variant="tertiary"
                size="small"
                icon={<CloseIcon fontSize="small" />}
                aria-label="Close"
                onPress={onClose}
              />
            )}
          </Flex>
        ) : undefined
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
