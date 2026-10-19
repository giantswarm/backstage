import { Alert, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

import type { MissingReleaseFile } from '../../lib/agentManager';

const useStyles = makeStyles({
  // bui `Text` and `Link` set their own colour (`--bui-fg-primary`); on the
  // alert's tinted background they take the alert's instead, like its title.
  inherit: {
    color: 'inherit',
  },
  code: {
    fontFamily: 'monospace',
    overflowWrap: 'anywhere',
  },
});

/**
 * Why the skills of an agent applied from git cannot be updated from the
 * dialog: agent-manager opens the pull request only for a release in its own
 * file, and that file is not in the repository. That is how the agent is set
 * up, not a fault, so it reads as information: what the person can do, in
 * plain words, first; then, a step smaller, what agent-manager checked and
 * what to change by hand. Where the release is defined instead is not
 * something agent-manager knows, so the notice does not claim a place.
 */
export function MissingReleaseFileAlert({
  missing,
}: {
  missing: MissingReleaseFile;
}) {
  const classes = useStyles();
  return (
    <Alert
      status="info"
      icon
      title="Skills cannot be updated here"
      description={
        <Flex direction="column" gap="2">
          <Text as="p" variant="body-medium" className={classes.inherit}>
            To update the skills, change their pins in the agent's GitOps
            source.
          </Text>
          <Text as="p" variant="body-small" className={classes.inherit}>
            agent-manager edits the HelmRelease{' '}
            <span className={classes.code}>{missing.release}</span> only in{' '}
            <span className={classes.code}>{missing.path}</span>, and{' '}
            <Link
              href={`https://github.com/${missing.repository}`}
              target="_blank"
              rel="noopener noreferrer"
              variant="body-small"
              className={classes.inherit}
            >
              {missing.repository}
            </Link>{' '}
            has no such file. In the file that defines the release, pin each
            skill marked “Moves to the head” to the head commit shown for it
            above.
          </Text>
        </Flex>
      }
    />
  );
}
