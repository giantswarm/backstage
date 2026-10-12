---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agents: a new agent whose release is still being installed, or whose own tool
server (the RemoteMCPServer its release creates, named after it) does not
exist yet, shows as **Setting up** for three minutes after its creation — on
its page, in the Customize list and in the composer's agent picker — instead
of "Failed", "did not become ready" or "The agent's release did not become
ready", and as the failure only after that. Every other failure, including a
missing ModelConfig or Secret, and any failure of an agent that is not new, is
shown at once. The age is measured on the server's clock, not the browser's.
The page keeps re-reading the agent, every 5 s for the first three minutes and
then less often, so it turns ready without a reload.
