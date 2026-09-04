---
'@giantswarm/backstage-plugin-plans': minor
'@giantswarm/backstage-plugin-plans-backend': minor
---

Plan documents are read and PR comments are written as the signed-in user.
The plans backend no longer uses the deployment's GitHub App credentials: the
frontend obtains the user's GitHub token from the portal's `github` auth
provider (connecting the account on first use) and sends it with every request,
so comments appear on GitHub authored by the person instead of by a bot account
with a "via Dev Portal" prefix. Deployments need the `github` auth provider
configured, and its GitHub App installed on the plan repositories with Pull
requests and Issues write access.
