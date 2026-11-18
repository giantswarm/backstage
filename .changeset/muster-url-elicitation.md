---
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

Tool calls from the portal declare MCP URL mode elicitation (protocol 2026-07-28). When muster answers that the person must open a page first, a sign-in to the tool's server or a server's own page such as a credential form, the portal shows it in the consent dialog and sends the call again with the person's answer (accept, decline or cancel). The same page asked by the same server is not asked about again for two minutes. `MusterMcpClient` calls that pass `urlElicitation` run on `@modelcontextprotocol/client` and throw `MusterInputRequiredError` (428) for muster's `input_required` answer. `gs-common` adds the wire types (`MusterInputAnswer`, `MusterUrlElicitation`, `inputRequiredBodyOf`) and now holds `musterServerOfTool`, which `gs-node` re-exports. `MusterApi.callTool` takes an optional `signal`, which also cancels a retry muster holds until a sign-in completes, and a tool's Run shows Cancel while a run is pending.
