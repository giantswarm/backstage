import { parseEntityRef } from '@backstage/catalog-model';
import { useUserProfile } from '@backstage/plugin-user-settings';

export function useCurrentUser() {
  const { backstageIdentity } = useUserProfile();

  let isGSUser = false;
  if (backstageIdentity) {
    const userEntity = parseEntityRef(backstageIdentity.userEntityRef);
    isGSUser = userEntity.namespace === 'giantswarm';
  }

  return { isGSUser };
}
