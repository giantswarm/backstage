import { Alert, Button, Flex, Text } from '@backstage/ui';
import { countNoun } from '@giantswarm/backstage-plugin-ui-react';
import {
  useClusterAccessStatus,
  useSignInAgain,
} from '../../../apis/clusterAccessStatus';
import type { UnlistedInstallation } from '../../clusters/ClustersDataProvider';

/** The reason as the end of a sentence: one full stop, never two. */
function asSentenceEnd(reason: string): string {
  const trimmed = reason.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** How many environments get an alert of their own; the rest are counted. */
export const UNLISTED_ALERTS_MAX = 3;

/**
 * Names each environment whose clusters are missing from the list, with
 * why: one alert per environment, at most {@link UNLISTED_ALERTS_MAX}, then
 * how many more. An environment whose sign-in expired offers the sign-in
 * that fixes it.
 */
export function UnlistedEnvironmentsAlert({
  installations,
}: {
  installations: UnlistedInstallation[];
}) {
  const access = useClusterAccessStatus();
  const signInAgain = useSignInAgain();
  if (installations.length === 0) {
    return null;
  }
  const shown = installations.slice(0, UNLISTED_ALERTS_MAX);
  const more = installations.length - shown.length;
  return (
    <Flex direction="column" gap="2">
      {shown.map(({ installation, reason }) => {
        const expired = access.some(
          entry =>
            entry.installation === installation &&
            entry.state === 'session-expired',
        );
        return (
          <Alert
            key={installation}
            status="warning"
            icon
            title={`Clusters in ${installation} are not listed.`}
            description={
              expired
                ? `Your sign-in to ${installation} has expired.`
                : `Reading them failed: ${asSentenceEnd(reason)}`
            }
            customActions={
              expired ? (
                <Button size="small" variant="secondary" onPress={signInAgain}>
                  Sign in again
                </Button>
              ) : undefined
            }
          />
        );
      })}
      {more > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          {`Clusters in ${countNoun(more, 'more environment')} are not listed either.`}
        </Text>
      )}
    </Flex>
  );
}
