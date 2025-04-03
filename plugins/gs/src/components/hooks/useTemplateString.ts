import { useUserProfile } from '@backstage/plugin-user-settings';
import { formatTemplateString } from '../utils/formatTemplateString';
import { useMemo } from 'react';

export function useTemplateString(
  template: string,
  data?: Record<string, any>,
) {
  const { displayName, loading } = useUserProfile();

  return useMemo(() => {
    if (loading) {
      return undefined;
    }

    return formatTemplateString(template, { data, currentUser: displayName });
  }, [loading, template, data, displayName]);
}
