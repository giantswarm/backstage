import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { SimpleAccordion } from '@giantswarm/backstage-plugin-ui-react';

import {
  leadingEntryIndex,
  summarizeEntry,
  WorkspaceNotice,
  WorkspaceNoticeEntry as NoticeEntry,
} from '../../../lib/workspaceNotice';

const useStyles = makeStyles({
  // Repository names and git's output are long words: they wrap anywhere at
  // phone width rather than push the timeline sideways.
  entry: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    // bui's Alert sets the description right under the title; the fold-out
    // and the lines under it need room to read as their own.
    '& .bui-AlertTitle': {
      marginBottom: 5,
    },
  },
  list: {
    margin: 0,
    paddingLeft: '1.25em',
  },
  name: {
    fontFamily: 'var(--bui-font-monospace)',
    overflowWrap: 'anywhere',
  },
  // Git's own words, with their line breaks.
  output: {
    fontFamily: 'var(--bui-font-monospace)',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
});

/** What an entry says in sight, under its summary, when its summary is not all. */
function entrySentence(entry: NoticeEntry): string | undefined {
  switch (entry.kind) {
    case 'failed':
      return 'This session’s directory could not be set up.';
    case 'reset':
      return entry.text;
    default:
      return undefined;
  }
}

/** Whether an entry keeps anything behind the details fold-out. */
function hasEntryDetail(entry: NoticeEntry): boolean {
  switch (entry.kind) {
    case 'failed':
      return Boolean(entry.error);
    case 'stale':
      return entry.repositories.length > 0 || Boolean(entry.note);
    case 'recovered':
      return entry.repositories.length > 0;
    case 'other':
      // The first line is the summary; only more lines are worth a fold-out.
      return entry.text.includes('\n');
    default:
      return false;
  }
}

/** What an entry keeps behind the details fold-out. */
function EntryDetail({ entry }: { entry: NoticeEntry }) {
  const classes = useStyles();
  switch (entry.kind) {
    case 'failed':
      return (
        <Text variant="body-small" className={classes.output}>
          {entry.error}
        </Text>
      );
    case 'stale':
      return (
        <Flex direction="column" gap="1">
          <Text variant="body-small">
            These repositories stay at the workspace’s last sync:
          </Text>
          {entry.repositories.length > 0 && (
            <ul className={classes.list}>
              {entry.repositories.map((repository, index) => (
                <li key={index}>
                  <Text variant="body-small">
                    <span className={classes.name}>{repository.name}</span>
                    {repository.reason && (
                      <>
                        {': '}
                        <span className={classes.output}>
                          {repository.reason}
                        </span>
                      </>
                    )}
                  </Text>
                </li>
              ))}
            </ul>
          )}
          {/* What came with the list but is not a repository line, as kagent
              wrote it. */}
          {entry.note && (
            <Text variant="body-small" className={classes.output}>
              {entry.note}
            </Text>
          )}
        </Flex>
      );
    case 'recovered':
      return (
        <Flex direction="column" gap="1">
          <Text variant="body-small">
            An earlier turn could not clone or fetch these repositories; they
            are up to date now:
          </Text>
          <ul className={classes.list}>
            {entry.repositories.map((name, index) => (
              <li key={index}>
                <Text variant="body-small" className={classes.name}>
                  {name}
                </Text>
              </li>
            ))}
          </ul>
        </Flex>
      );
    case 'other':
      return (
        <Text variant="body-small" className={classes.output}>
          {entry.text}
        </Text>
      );
    default:
      return null;
  }
}

/**
 * A workspace setup notice: kagent's report on the session's directory before
 * the turn started. A status of the turn, not the agent's reply, so it is an
 * alert above the agent's output in the manner of an egress refusal: one line
 * that says what happened, the per-repository reasons (git's raw output) in a
 * fold-out. A warning when the agent may be working on something other than
 * what the person expects, information when it only reports a recovery.
 *
 * A notice holding several variants is titled by its first warning; the rest
 * are a line each under it.
 */
export function WorkspaceNoticeEntry({ notice }: { notice: WorkspaceNotice }) {
  const classes = useStyles();
  const lead = leadingEntryIndex(notice);
  const ordered = [
    notice.entries[lead],
    ...notice.entries.filter((_, index) => index !== lead),
  ];
  const details = ordered
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => hasEntryDetail(entry));

  return (
    <div
      className={classes.entry}
      data-testid="timeline-workspace-notice"
      data-severity={notice.severity}
    >
      <Alert
        status={notice.severity}
        icon
        title={summarizeEntry(ordered[0])}
        description={
          <Flex direction="column" gap="1">
            {ordered.map((entry, index) => {
              const sentence = entrySentence(entry);
              const summary = index === 0 ? undefined : summarizeEntry(entry);
              if (!summary && !sentence) {
                return null;
              }
              return (
                <Text key={index} variant="body-small">
                  {summary && sentence
                    ? `${summary}. ${sentence}`
                    : (summary ?? sentence)}
                </Text>
              );
            })}
            {details.length > 0 && (
              <SimpleAccordion title="Technical details" headingLevel={4}>
                <Flex direction="column" gap="2">
                  {details.map(({ entry, index }) => (
                    <EntryDetail key={index} entry={entry} />
                  ))}
                </Flex>
              </SimpleAccordion>
            )}
          </Flex>
        }
      />
    </div>
  );
}
