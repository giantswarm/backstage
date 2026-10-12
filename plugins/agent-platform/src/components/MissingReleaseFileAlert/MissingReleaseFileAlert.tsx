import { Alert, Link } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

import type { MissingReleaseFile } from '../../lib/agentManager';

const useStyles = makeStyles({
  code: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    overflowWrap: 'anywhere',
  },
});

/**
 * Why agent-manager cannot open the pull request, in the terms of what it
 * checked: the one file it edits a release in is not in the repository. Where
 * the release is defined instead is not something agent-manager knows, so the
 * alert does not claim a place.
 */
export function MissingReleaseFileAlert({
  missing,
  change,
}: {
  missing: MissingReleaseFile;
  /** What to change by hand, e.g. "the pins listed below". */
  change: string;
}) {
  const classes = useStyles();
  return (
    <Alert
      status="warning"
      title="agent-manager cannot open this pull request"
      description={
        <>
          It edits the HelmRelease{' '}
          <span className={classes.code}>{missing.release}</span> only in{' '}
          <span className={classes.code}>{missing.path}</span>, and{' '}
          <Link
            href={`https://github.com/${missing.repository}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {missing.repository}
          </Link>{' '}
          has no such file. Change {change} in the file that defines the
          release.
        </>
      }
    />
  );
}
