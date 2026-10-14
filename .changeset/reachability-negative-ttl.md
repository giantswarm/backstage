---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A "not reachable from this portal" answer for a kagent installation is now
trusted for one minute, re-read every minute while it lasts, instead of being
cached (and persisted across reloads) for an hour. Usage and Sessions come back
within about a minute and a half of the installation recovering. A reachable
answer is still cached for an hour.
