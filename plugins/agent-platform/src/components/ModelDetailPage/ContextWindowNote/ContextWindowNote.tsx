import { Alert, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { MONO } from '@giantswarm/backstage-plugin-ui-react';

import type { ContextWindowLookup } from '../../../lib/contextWindows';

/** The configuration reference's section on the context-window table. */
export const CONTEXT_WINDOWS_DOCS_URL =
  'https://github.com/giantswarm/backstage/blob/main/docs/agent-platform-configuration.md#context-windows-agentplatformmodelscontextwindows';

const TABLE_KEY = 'agentPlatform.models.contextWindows';

const useStyles = makeStyles({
  // bui `Text` and `Link` set their own colour (`--bui-fg-primary`); on the
  // alert's tinted background they take the alert's instead, like its title.
  inherit: {
    color: 'inherit',
  },
});

/**
 * The model page's word on a model the context-window table
 * (`agentPlatform.models.contextWindows`) gives no usable window: its
 * sessions show a raw token count instead of how full the context is. Not a
 * fault, so it reads as information: what is missing and why it matters
 * first; then, a step smaller, what to change. Only whoever deploys the
 * portal can change its app-config, and the note shows to everyone who opens
 * the page, so that line says whom to ask, as `modelProblem` does when the
 * reader cannot make the fix.
 *
 * Without a usable entry for the model (`lookup.kind` `none`) it asks for a
 * pattern; with entries that match but whose value is not a number of tokens
 * (`invalid`) it names the one to fix.
 */
export function ContextWindowNote({
  model,
  lookup,
}: {
  /** The ModelConfig's model id, which the table's patterns match. */
  model: string;
  lookup: Exclude<ContextWindowLookup, { kind: 'window' }>;
}) {
  const classes = useStyles();
  const invalid = lookup.kind === 'invalid';
  return (
    <Alert
      // Information beside the facts, not news: a note, not an alert role.
      role="note"
      aria-label="Context window"
      status="info"
      icon
      title={
        invalid
          ? 'The context window configured for this model is not valid'
          : 'No context window is configured for this model'
      }
      description={
        <Flex direction="column" gap="2">
          <Text as="p" variant="body-medium" className={classes.inherit}>
            {invalid
              ? 'Until it is fixed, a session cannot show how full its context is.'
              : 'Configuring one lets a session show how full its context is.'}
          </Text>
          <Text as="p" variant="body-small" className={classes.inherit}>
            {invalid ? (
              <>
                Ask whoever runs this portal to set{' '}
                <span style={MONO}>{lookup.pattern}</span> under{' '}
                <span style={MONO}>{TABLE_KEY}</span> to a number of tokens,
                such as 200000.
              </>
            ) : (
              <>
                Ask whoever runs this portal to add a pattern matching{' '}
                <span style={MONO}>{model}</span> to{' '}
                <span style={MONO}>{TABLE_KEY}</span>.
              </>
            )}{' '}
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
