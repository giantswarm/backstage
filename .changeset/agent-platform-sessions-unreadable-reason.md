---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

The Sessions page names why an installation could not be read (authentication
failed, permission denied, timed out, unreachable, server error) and the request
id of the failed call. The backend sends that id toward kagent as
`x-request-id` and logs every failed session list with its call, status, code
and request id, so a failure can be matched with the gateway's logs.
