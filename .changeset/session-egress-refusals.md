---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The session view shows each egress refusal of the Session on the turn that met
it: the refused host and port, why (not in the agent's egress settings, or raw
TCP), when, how many requests, the origin to add, and a link to the agent's
egress settings. The refusals come from the Substrate egress gateway's
per-actor counter in the installation's metrics, read as the signed-in person
for that Session's actor only.
