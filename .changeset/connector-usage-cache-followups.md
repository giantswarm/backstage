---
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-muster': patch
'app': patch
---

The usage cache no longer shares answers between people signed in as the guest user, and looks the prometheus server up again after a read through it failed. The settings storage no longer reuses a "not set" answer: subscriptions that start together share one read, and every later subscription reads what is stored now.
