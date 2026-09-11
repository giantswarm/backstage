import { useCallback } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { Alert, Button, Flex } from '@backstage/ui';

/**
 * Same `gs-` prefix as the plugin's other remembered UI state. The notice is
 * about the installation, not the user, so it is not namespaced per user.
 */
const STORAGE_KEY = 'gs-agent-platform-sessions-migration-notice-dismissed';

/**
 * Tells the person that the conversations from before the move to kagent API
 * v2 are not here.
 *
 * Conversation state was not migrated (plan decision D9): every installation
 * on the API v2 line starts with an empty controller database, and a person
 * who had sessions on the previous line would otherwise open the Sessions tab
 * to an empty list with no explanation — or, worse, to a list of only their
 * recent sessions and wonder where the rest went. So the tab says so, plainly,
 * until the person dismisses it.
 *
 * Dismissible rather than permanent because it is true forever and interesting
 * once. Remembered per browser, like the composer's last-used agent.
 */
export function SessionsMigrationNotice() {
  const [dismissed, setDismissed] = useLocalStorageState<boolean>(STORAGE_KEY, {
    defaultValue: false,
  });
  const dismiss = useCallback(() => setDismissed(true), [setDismissed]);

  if (dismissed) {
    return null;
  }

  return (
    <Alert
      status="info"
      title="Earlier conversations are not shown here"
      description={
        <Flex direction="column" gap="2" align="start">
          <span>
            This installation moved to kagent API v2, and conversations from
            before the move were not carried over. Sessions you start now are
            listed here; the earlier ones are gone.
          </span>
          <Button size="small" variant="secondary" onPress={dismiss}>
            Got it
          </Button>
        </Flex>
      }
    />
  );
}
