---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-gs-node': patch
---

A connector's edit (the wizard's _Save changes_, the JSON edit) goes through muster's split connector writes where muster has them: the connection (type, URL, sign-in, client, headers, request metadata) through `core_mcpserver_connect`, the rest through `core_mcpserver_update`. muster with tool approval refuses connection fields on `core_mcpserver_update`, so an edit failed there before. A muster without `core_mcpserver_connect` still gets one update. muster-backend answers a split write's refusal of another write's arguments, and refusals of `core_mcpserver_connect` and `_set_approval`, with 422 like the other connector refusals.
