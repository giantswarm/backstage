---
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-flux': patch
---

Give each plugin's persisted react-query cache its own localStorage key, with a
size guard.

The gs, flux and agent-platform `QueryClientProvider`s all persisted under the
library's default key `REACT_QUERY_OFFLINE_CACHE`. Every client rehydrated the
others' entries on restore and wrote them back on its next save, so the three
caches merged into one blob — 4.9 MB on the Dev Portal, 3.6 MB of it flux
Kustomization lists — against a per-origin localStorage budget of roughly 5 MB,
where one quota error would have silently ended persistence for all of them.

- `kubernetes-react`: new `createPluginQueryPersister({ key, throttleTime?, maxChars? })`.
  Writes under the plugin's key, removes the legacy shared blob, keeps the
  persisted copy under 2 MB by leaving out the oldest queries first
  (`trimPersistedClient`), retries a quota error with the client halved, and
  reads garbage under the key as "nothing persisted" instead of an error per
  mount (`deserializePersistedClient`). The rule from #2264 stands: a new data
  shape needs a new _query_ key, and what is iterated from the cache is guarded.
- `gs` persists under `gs-react-query-cache`, `agent-platform` under
  `agent-platform-react-query-cache`, `flux` under `flux-react-query-cache`.
  The first load after the upgrade refetches once; reloads after that rehydrate
  as before.
