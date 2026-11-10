---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs-backend': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

The agent wizard handles skills from private repositories: the skills step marks a private repository and its skills, and the skills step and the review say which credential the agent fetches them with (the installation's, as agent-manager reports it, or the agent's own) or warn, without blocking, when the installation has none or its token fails to refresh. An agent whose skills credential Secret is missing says so and that it recovers once the Secret exists, apart from an agent that has not booted yet, which points at the boot log.
