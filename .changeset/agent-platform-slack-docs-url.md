---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs-backend': patch
---

The "Use your agents right in Slack" banner has a "How it works" button that
opens the installation's guide in a new tab: `agentPlatform.integrations.slackDocsUrl`
where a platform admin sets it, Giant Swarm's docs otherwise. The new key is
part of the signed-in config.
