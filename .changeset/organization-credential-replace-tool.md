---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Replace key and Replace credential on an organization's Models and Connectors tabs, and a new key from Edit model, ask agent-manager's `replace_organization_credential`: the request writes the credential's Secret only, and the credential form lists every model, connector or egress policy that uses it and where each sends the value. A connector with several credential Secrets offers one Replace for each. An organization model's provider can no longer be changed on Edit model. Refusals say what to do, and a save refused because the objects that use the credential changed says to start again.
