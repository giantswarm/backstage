---
'@giantswarm/backstage-plugin-platform-capabilities-backend': patch
---

`GET /installations?summary=true` forwards `summary: true` to the manager's
`list_installations`: the states and the last actions alone, what the
Installations page's columns ask for.
