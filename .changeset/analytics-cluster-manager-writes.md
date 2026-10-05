---
'@giantswarm/backstage-plugin-analytics-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': patch
---

Track creating a cluster (`AgentPlatform.clusterCreated`) and adding a GPU node
pool (`AgentPlatform.nodePoolCreated`) through cluster-manager, each with its
`mode` (`apply` or `commit`). The writes that ran outside react-query (the
cluster-manager and model-manager dialogs, muster's server and workflow
dialogs) now go through `useTrackedMutation`, so every one of them is tracked
or opts out explicitly.
