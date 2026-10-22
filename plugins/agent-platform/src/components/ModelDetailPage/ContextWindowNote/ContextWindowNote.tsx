import { Alert, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

/** The configuration reference's section on the context-window table. */
export const CONTEXT_WINDOWS_DOCS_URL =
  'https://github.com/giantswarm/backstage/blob/main/docs/agent-platform-configuration.md#context-windows-agentplatformmodelscontextwindows';

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
 * The model page's word on a model the context-window table
 * (`agentPlatform.models.contextWindows`) does not name: its sessions show a
 * raw token count instead of how full the context is. Not a fault, so it
 * reads as information: what is missing and why it matters first; then, a
 * step smaller, where to set it, for whoever runs the portal.
 */
export function ContextWindowNote({ model }: { model: string | undefined }) {
  const classes = useStyles();
  return (
    <Alert
      // Information beside the facts, not news: a note, not an alert role.
      role="note"
      aria-label="Context window"
      status="info"
      icon
      title="No context window is configured for this model"
      description={
        <Flex direction="column" gap="2">
          <Text as="p" variant="body-medium" className={classes.inherit}>
            Configure one so a session can show how full its context is.
          </Text>
          <Text as="p" variant="body-small" className={classes.inherit}>
            Add a pattern
            {model && (
              <>
                {' '}
                matching <span className={classes.code}>{model}</span>
              </>
            )}{' '}
            to{' '}
            <span className={classes.code}>
              agentPlatform.models.contextWindows
            </span>{' '}
            in the portal’s app-config.{' '}
            <Link
              href={CONTEXT_WINDOWS_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              variant="body-small"
              className={classes.inherit}
            >
              How to configure it
            </Link>
          </Text>
        </Flex>
      }
    />
  );
}
