---
'@giantswarm/backstage-plugin-muster': patch
---

Refresh the MCP-server reads immediately after a mutation succeeds, instead of
leaving the page stale until the next 30s background poll.

Confirming Activate / Deactivate / Reconnect / Delete (and saving an ad-hoc
server definition) now triggers the provider's CRD refetch and invalidates the
aggregator's runtime server list (the "Runtime (live)" block). muster writes
the CR synchronously inside the tool call, so spec-derived UI — most visibly
the Activate/Deactivate swap keyed on `spec.suspended` — flips on the very
next read rather than 10–30s later. `status.state` trails the reconciler by a
beat, so a single follow-up refetch fires ~2.5s later to catch the settled
status.

This matters doubly in unfocused tabs: react-query pauses `refetchInterval`
there and the plugin's QueryClient has focus-refetch off, so before this
change a background tab could show a stale row indefinitely. The confirm
dialog's "may take a moment to reflect in the CRD list" copy is updated to
match the new behaviour.

New `useMusterMutationRefresh(installation)` hook in the
MusterInstanceProvider module; `MusterInstanceContext` is now exported for
hooks that degrade gracefully outside the provider and for tests.
