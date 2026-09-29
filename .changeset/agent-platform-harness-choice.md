---
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
---

The agent creation wizard lists the Harnesses of the model's namespace as runtime cards and creates the agent on the one picked, passing `harness` to agent-manager's `validate_agent` and `create_agent`. The platform Harness stays the default and is sent as no `harness` at all; a namespace with a single Harness shows it as a read-only card. The review names the chosen Harness and its runtime. A Harness is offered only when every requirement of its selector holds for the labels the Generic chart puts on the template; a list read only in part says it may be incomplete. `kubernetes-react` exports a `Harness` resource class.
