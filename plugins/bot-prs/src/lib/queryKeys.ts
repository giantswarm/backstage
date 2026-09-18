/**
 * marge's reads: a team's queue as the signed-in person's GitHub grant sees
 * it. Under the `muster` prefix, which the muster plugin's sign-in flow
 * invalidates once the person connects to a server, so the queue loads by
 * itself after the sign-in. Nothing here is persisted: the client in
 * `BotPrsProviders` keeps its cache in memory.
 */
export function musterMargeListQueryKey(installation: string, teams: string[]) {
  return [
    ...musterMargeListScopeKey(installation),
    [...teams].sort().join(','),
  ] as const;
}

/**
 * Every queue read of one installation. A write invalidates the scope and
 * not one team: the queues of a call are one cache entry, so the entry the
 * write changed is found by its prefix.
 */
export function musterMargeListScopeKey(installation: string) {
  return ['muster', 'bot-prs', 'marge-list', installation] as const;
}

/** `core_mcpserver_list` of one installation's muster: whether it lists marge. */
export function musterServersQueryKey(installation: string) {
  return ['muster', 'bot-prs', 'mcp-servers', installation] as const;
}
