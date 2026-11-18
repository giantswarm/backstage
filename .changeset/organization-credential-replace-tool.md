---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Replace key and Replace credential on an organization's Models and Connectors tabs, and a new key from Edit model, ask agent-manager's `replace_organization_credential`: the request writes the credential's Secret only, and the credential form lists every model, connector or egress policy that uses it and where each sends the value. A connector with several credential Secrets offers one Replace for each. An organization model's provider can no longer be changed on Edit model. Refusals say what to do, and a save refused because the objects that use the credential changed (agent-manager's `credential_consumers_changed`) says to start again from the organization's tab, which sends a new request, and takes no value for the stale one. Replace needs agent-manager v2.24.0-rc.6 or later; the "start again" alert needs v2.24.0-rc.7 or later, and with rc.6 that refusal shows as Not saved.
