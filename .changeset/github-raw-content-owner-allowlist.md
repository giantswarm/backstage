---
'@giantswarm/backstage-plugin-gs-backend': patch
---

The `/github/raw-content` proxy attaches the portal's GitHub credentials only
for repository owners in `gs.githubRawContent.allowedOwners` (default:
`giantswarm`). Previously it requested credentials for whatever owner appeared
in the caller-supplied URL, so any signed-in portal user could read private
content from every repository the portal's GitHub App can see. URLs under
other owners are still proxied, but without credentials, so only their public
content is reachable.
