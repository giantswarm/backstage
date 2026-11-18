import { useEffect, useState } from 'react';
import { useApiHolder } from '@backstage/core-plugin-api';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The Environments setting is gs's, shared by the whole portal.
import { mutedInstallationsApiRef } from '@giantswarm/backstage-plugin-gs';

function sameContents(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The installations the person turned off (Profile and settings,
 * Environments): the portal asks them nothing. Follows each change as it is
 * made, without a reload. gs `useMutedInstallations` needs the setting's API;
 * this reads none where a portal or a test has no such API, so every
 * installation is on there.
 */
export function useTurnedOffInstallations(): string[] {
  const holder = useApiHolder();
  // A test that mocks the gs plugin may leave the ref out.
  const api = mutedInstallationsApiRef
    ? holder.get(mutedInstallationsApiRef)
    : undefined;
  const [muted, setMuted] = useState<string[]>(() => api?.getSnapshot() ?? []);
  useEffect(() => {
    if (!api) {
      return undefined;
    }
    const subscription = api
      .muted$()
      .subscribe(next =>
        setMuted(previous => (sameContents(previous, next) ? previous : next)),
      );
    return () => subscription.unsubscribe();
  }, [api]);
  return muted;
}
