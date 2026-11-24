---
'@giantswarm/backstage-plugin-ai-chat': minor
'@giantswarm/backstage-plugin-ai-chat-backend': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

AI Chat asks the person in the conversation when a muster tool needs a sign-in to another service: it names the server, shows the destination host and the full https address, and offers to open it, decline or cancel. After the sign-in the tool runs and the model continues with its result; a decline or cancel tells the model the tool did not run. Addresses that are not https, or carry a user name before the host, are not offered as links. The backend's muster `call_tool` now declares URL elicitation through the official MCP SDK client, and `POST /muster/retry` sends the call again with the person's answer. gs-common adds `toolInputRequiredOf`, and ui-react exports `describeExternalUrl`.
