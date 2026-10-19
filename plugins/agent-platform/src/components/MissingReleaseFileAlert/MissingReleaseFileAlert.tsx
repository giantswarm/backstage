import { Alert, Flex, Link } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

import type { MissingReleaseFile } from '../../lib/agentManager';

const useStyles = makeStyles({
  paragraph: {
    margin: 0,
  },
  // The technical paragraph, a step below the plain one (bui's body-x-small).
  // A bui `Text` would set its own colour on the alert's tinted background,
  // so the paragraph inherits the alert's.
  details: {
    margin: 0,
    fontSize: 'var(--bui-font-size-1)',
    lineHeight: 1.4,
  },
  code: {
    fontFamily: 'monospace',
    overflowWrap: 'anywhere',
  },
});

/**
 * agent-manager cannot open the pull request because the one file it edits a
 * release in is not in the repository. That is how the agent is set up, not a
 * fault, so it reads as information: what the person can do, in plain words,
 * first; then, smaller, what agent-manager checked. Where the release is
 * defined instead is not something agent-manager knows, so the notice does not
 * claim a place.
 */
export function MissingReleaseFileAlert({
  missing,
  title,
  summary,
  change,
}: {
  missing: MissingReleaseFile;
  /** What cannot be done here, e.g. "Skills cannot be updated here". */
  title: string;
  /** What to do instead, in one plain sentence. */
  summary: string;
  /** What to change by hand, e.g. "the pins listed above". */
  change: string;
}) {
  const classes = useStyles();
  return (
    <Alert
      status="info"
      icon
      title={title}
      description={
        <Flex direction="column" gap="2">
          <p className={classes.paragraph}>{summary}</p>
          <p className={classes.details}>
            agent-manager edits the HelmRelease{' '}
            <span className={classes.code}>{missing.release}</span> only in{' '}
            <span className={classes.code}>{missing.path}</span>, and{' '}
            <Link
              href={`https://github.com/${missing.repository}`}
              target="_blank"
              rel="noopener noreferrer"
              variant="body-x-small"
            >
              {missing.repository}
            </Link>{' '}
            has no such file. Change {change} in the file that defines the
            release.
          </p>
        </Flex>
      }
    />
  );
}
