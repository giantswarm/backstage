---
'@giantswarm/backstage-plugin-muster': patch
---

Make the per-server MCP sign-in survive a realistic OAuth round-trip. The
watch on `auth://status` used to give up after 3 minutes with polling paused
while the user was on the IdP's tab and no re-read on returning — so a
sign-in that took longer (Miro's organization/team pickers alone exceed it)
completed successfully yet the MCP servers page still showed "Sign in" over
an already-connected server. The wait now lasts 15 minutes, keeps polling
while the tab is in the background, re-reads the status when the user
returns to the tab, and a sign-in observed to complete even after the
deadline still unblocks the page.
