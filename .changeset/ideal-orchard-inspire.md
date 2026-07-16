---
'@giantswarm/backstage-plugin-ai-chat-react': minor
'@giantswarm/backstage-plugin-flux-react': minor
'@giantswarm/backstage-plugin-gs': minor
---

Let users ask the AI chat to explain Flux error messages. ai-chat-react exports a new `buildExplainErrorMessage` prompt builder that embeds a resource's failing condition message plus context (kind, name, namespace, cluster, reason, revision). The Flux resource card's "Troubleshoot with AI" button now sends the actual error message instead of asking the AI to look the resource up, and the HelmRelease conditions card on the deployment details page gets an "Explain this error" button on failing conditions. The buttons render nothing on installations without ai-chat enabled.
