/**
 * marge's reads: a team's queue as the signed-in person's GitHub grant sees
 * it. Under the `muster` prefix, which the muster plugin's sign-in flow
 * invalidates once the person connects to a server, so the queue loads by
 * itself after the sign-in. Nothing here is persisted: the client in
 * `BotPrsProviders` keeps its cache in memory.
 */
export function musterMargeListQueryKey(installation: string, team: string) {
  return ['muster', 'bot-prs', 'marge-list', installation, team] as const;
}

/** `core_mcpserver_list` of one installation's muster: whether it lists marge. */
export function musterServersQueryKey(installation: string) {
  return ['muster', 'bot-prs', 'mcp-servers', installation] as const;
}
