---
'@giantswarm/backstage-plugin-muster': patch
---

Connector sign-in: the tab a Sign in click opens now says "Opening the
sign-in page…" while muster prepares the page, instead of a bare
about:blank. When muster takes longer than 10 seconds, or the person closes
the tab first, the tab is closed and the row offers the sign-in at once:
"Open sign-in page" becomes a link as soon as muster's page is ready, rather
than after the Sign in button's spinner. Each click's answer only ever opens
in that click's own tab. This applies wherever a connector or server sign-in
is offered.
