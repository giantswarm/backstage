---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Cost page's by-agent table tells a reader what a row is. A pair of
gateway labels that matches no agent used to render as a bare
`namespace/name`, which read like a system component with spend; under
kagent API v2 that is what a removed agent looks like. Such a row is now
shown by its technical name, marked **Removed** and unlinked, with its spend
kept in the totals; an agent the portal knows is named and linked as before;
the gateway's own `unknown` reads as Unattributed. `LlmAgentRow` carries the
distinction as `kind`.

The note under the table describes how a call is attributed after the runtime
names the agent on it: the runtime sends the agent's name and namespace and
the person on each model call, the gateway records them for a call arriving
through the Substrate egress and attributes any other call to the
ServiceAccount of the pod that made it.
