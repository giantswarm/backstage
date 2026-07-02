import { useApiHolder } from '@backstage/core-plugin-api';
import { routeResolutionApiRef, useApi } from '@backstage/frontend-plugin-api';
import { useNavigate } from 'react-router-dom';
import { aiChatDrawerApiRef } from '../../api';
import { rootRouteRef } from '../../routes';
import { AIChatButtonOpenMode } from './types';

/**
 * Shared logic for opening the AI chat, used by both the Material UI and the
 * Backstage UI (bui) variants of the AI chat button. Returns a callback that
 * opens the chat drawer when available, otherwise navigates to the chat page.
 */
export function useOpenChat(openMode?: AIChatButtonOpenMode) {
  const routeResolutionApi = useApi(routeResolutionApiRef);
  const chatPath = routeResolutionApi.resolve(rootRouteRef);
  const navigate = useNavigate();
  const apiHolder = useApiHolder();

  return (message: string) => {
    const drawerApi = apiHolder.get(aiChatDrawerApiRef);
    if (openMode !== 'navigate' && drawerApi) {
      drawerApi.openDrawer(message);
    } else if (chatPath) {
      const params = new URLSearchParams({ message });
      navigate(`${chatPath()}?${params.toString()}`);
    }
  };
}
