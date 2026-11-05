---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Delete cluster: every pass of the removal shows what it removed or otherwise
changed, what is still being removed or left and why, and what it waits for,
and a pass that changed nothing new says "Nothing more could be removed yet".
After each pass the dialog asks cluster-manager by a dry run whether another
pass would do something new, and offers **Finish removal** only then. While the
uninstall runs it checks again every 15 seconds, through a failed check, for 30
minutes at most and not once what is left is not cluster-manager's to remove;
**Check again** starts another round. A check that finds nothing left reads as
the removal complete.
