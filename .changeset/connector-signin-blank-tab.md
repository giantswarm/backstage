---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

Connector sign-in: the tab a Sign in click opens now says "Opening the
sign-in page…" while muster prepares the page, instead of a bare
about:blank. When muster takes longer than 10 seconds, or the person closes
the tab first, the tab is closed and the row offers the sign-in at once: it
says the sign-in page is being prepared, and "Open sign-in page" becomes a
link as soon as the page is ready, rather than after the Sign in button's
spinner. A tab the person took to another address is left open. Each
click's answer only ever opens in that click's own tab, and a late answer
never replaces a newer sign-in. A provider App's device-code sign-in keeps
its button until muster issued the code.
