import { useState } from 'react';
import { Alert, Button } from '@backstage/ui';

/**
 * Read marks that could not be saved, with Try again: in the overlay, where
 * the person looks for their notifications, rather than a toast that the
 * overlay covers or that times out. The rows stay unread; the alert stays,
 * pending, while Try again runs, and goes once they are read.
 */
export function MarkFailureAlert({
  rows,
  retry,
}: {
  /** How many rows could not be marked read. */
  rows: number;
  retry: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const one = rows === 1;
  return (
    <Alert
      role="alert"
      status="danger"
      icon
      mt="2"
      mx="1"
      isPending={retrying}
      title={
        one
          ? 'Could not mark the notification read'
          : 'Could not mark the notifications read'
      }
      description={`What you have read could not be saved, so ${
        one ? 'it stays' : 'they stay'
      } unread.`}
      customActions={
        <Button
          variant="tertiary"
          size="small"
          isDisabled={retrying}
          onPress={() => {
            setRetrying(true);
            retry()
              .catch(() => {})
              .finally(() => setRetrying(false));
          }}
        >
          Try again
        </Button>
      }
    />
  );
}
