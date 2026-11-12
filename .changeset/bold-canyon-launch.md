---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The new-session composer keeps the agent and workspace readable however many toolchains are picked. The toolchains button shows a toolbox icon and the number picked, and lists them in its tooltip and popover. The workspace picker shows a folder icon instead of a "Workspace" label, and no longer says "Last used with …" or "…'s default" beside it. Where there is no other agent to choose, as on an agent's page, the agent is shown by its avatar and name instead of a picker. The agent and workspace take as much room as their names need, share it equally when it is short, and end in an ellipsis only then.
