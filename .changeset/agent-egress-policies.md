---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

An agent can pick EgressPolicies of its namespace: the agent form's More
options list the shared sets of origins the tenant admins keep there (each
with its origins and the header the gateway fills from its credential, never
the Secret), beside the typed Extra egress origins, where agent-manager offers
them (`get_info` capability `egressPolicies`) and never on a coding Harness.
The picks are sent as `egressPolicyRefs` on create and edit, listed with their
origins on the review and on the agent's Configuration card, and a pick the
namespace no longer holds says so. `Agent.getEgressPolicyRefs()` reads
`spec.egressPolicyRefs`.
