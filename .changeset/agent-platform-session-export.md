---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The session page's actions menu has **Export session**: it saves the session
and all of its tasks, as kagent stores them, as one JSON file, also mid-turn
and while the session waits on the person. A notice beside it says the file
holds everything the agent saw and is customer data. A session longer than the
portal reads (1,000 turns) saves no file and points to agent-manager's
`get_session`. The format is described in `docs/agent-platform-session-export.md`.
