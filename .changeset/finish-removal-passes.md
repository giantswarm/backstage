---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Delete cluster: every pass of the removal shows what it removed, what is still
being removed or left and why, and what it waits for, and a pass that removed
nothing new says "Nothing more could be removed yet". After each pass the dialog
asks cluster-manager by a dry run whether another pass would remove something
new, and offers **Finish removal** only then, checking again every 15 seconds
while the uninstall runs; a check that finds nothing left reads as the removal
complete.
