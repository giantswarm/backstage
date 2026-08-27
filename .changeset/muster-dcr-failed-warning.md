---
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-muster': patch
---

Recognize muster's new `dcr-failed` client identification method (muster#1086)
and warn truthfully on the per-server Sign-in: the authorization server
rejected muster's automatic client registration, rather than the
`cimd-fallback` claim that it advertises neither CIMD nor registration.
Older musters never send the value; portals on this version simply keep
showing the fallback warning for them.
