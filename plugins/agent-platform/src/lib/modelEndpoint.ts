const CREDENTIAL_PARAMETER =
  /(key|token|secret|password|passwd|auth|sig|credential)/i;
const CREDENTIAL_ENDPOINT_ERROR =
  'Use an endpoint URL without credentials, user information or fragments. Enter credentials on the credential form.';

export function modelEndpointProblem(value: string): string | undefined {
  const endpoint = value.trim();
  if (!endpoint) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return 'The endpoint must be an http:// or https:// URL';
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    return 'The endpoint must be an http:// or https:// URL';
  }
  if (parsed.username || parsed.password || parsed.hash) {
    return CREDENTIAL_ENDPOINT_ERROR;
  }
  try {
    decodeURI(parsed.search);
  } catch {
    return 'The endpoint query must contain valid URL encoding.';
  }
  if (parsed.search.includes(';')) {
    return 'The endpoint query cannot be checked for credentials. Use name=value parameters separated by &.';
  }
  for (const name of parsed.searchParams.keys()) {
    if (CREDENTIAL_PARAMETER.test(name)) return CREDENTIAL_ENDPOINT_ERROR;
  }
  return undefined;
}
