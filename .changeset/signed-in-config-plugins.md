---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-ai-chat': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-flux-react': minor
'@giantswarm/backstage-plugin-plans-backend': patch
'@giantswarm/backstage-plugin-platform-capabilities-backend': patch
'@giantswarm/backstage-plugin-repositories-backend': patch
'@giantswarm/backstage-plugin-roadmap-backend': patch
---

Read the muster, ai-chat, agent-platform and flux frontend config from the
signed-in config (`GET /api/gs/config`) instead of the public `index.html`.

`muster.serverName` and `muster.installations[].name/authProvider` (the
fleet's codenames), `aiChat.welcome.*`, `aiChat.mcp[].name/authProvider`,
`aiChat.contextWindow`, `agentPlatform.skills.repositories` and
`flux.gitRepositoryPatterns` keep the default (backend) visibility and reach
the browser after sign-in through `@giantswarm/backstage-plugin-gs-react`.
The plans, platform-capabilities, repositories and roadmap backends drop the
`@visibility frontend` markers no frontend read, so the public config no
longer names their muster installation, repositories, board or teams. No
`@visibility frontend` is left in these plugins.
