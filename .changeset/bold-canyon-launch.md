---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The new-session composer keeps the agent and workspace readable however many toolchains are picked. The toolchains button shows a toolbox icon and the number picked, and lists them in its tooltip and popover. The workspace picker shows a folder icon instead of a "Workspace" label, and no longer says "Last used with …" or "…'s default" beside it. When the row is short of room, the workspace picker narrows first, down to its folder, and only then the agent's name ends in an ellipsis.
