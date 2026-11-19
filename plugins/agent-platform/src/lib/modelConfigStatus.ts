export const MODEL_CONFIGURED_LABEL = 'Configured';

export function modelConfiguredDetail(apiKeySecret?: string): string {
  return apiKeySecret
    ? 'Settings accepted and the key Secret was found. The key itself has not been tested.'
    : 'Settings accepted. Provider access has not been tested.';
}
