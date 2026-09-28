---
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
---

The agent creation wizard lists the Harnesses of the model's namespace as runtime cards and creates the agent on the one picked, passing `harness` to agent-manager's `validate_agent` and `create_agent`. The platform Harness stays the default and is sent as no `harness` at all; the section is hidden when the namespace offers no other Harness. The review names the chosen Harness and its runtime. `kubernetes-react` exports a `Harness` resource class.
