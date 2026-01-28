import {
  BackstageCredentials,
  BackstageUserPrincipal,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { tool } from 'ai';
import { z } from 'zod';

/**
 * Creates user-scoped tools that require access to the current request's credentials.
 */
export function createUserTools(
  userInfo: UserInfoService,
  credentials: BackstageCredentials<BackstageUserPrincipal>,
) {
  return {
    getCurrentUserInfo: tool({
      description:
        'Get information about the currently authenticated user, including their entity reference and group memberships.',
      inputSchema: z.object({}),
      execute: async () => {
        const info = await userInfo.getUserInfo(credentials);
        return {
          userEntityRef: info.userEntityRef,
          ownershipEntityRefs: info.ownershipEntityRefs,
        };
      },
    }),
  };
}
