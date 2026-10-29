import { useEffect, useState } from 'react';
import {
  identityApiRef,
  ProfileInfo,
  useApi,
} from '@backstage/frontend-plugin-api';

export function useProfile(): ProfileInfo | undefined {
  const identityApi = useApi(identityApiRef);
  const [profile, setProfile] = useState<ProfileInfo>();
  useEffect(() => {
    let cancelled = false;
    identityApi
      .getProfileInfo()
      .then(info => {
        if (!cancelled) {
          setProfile(info);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [identityApi]);
  return profile;
}
