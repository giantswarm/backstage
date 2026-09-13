---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A Stop that fails on the session page is reported as **Stop failed** with the
backend's message, no longer as "Message not sent" — the turn it aimed at is
still running, and the old wording said the opposite of what happened. A 401
(the tab's token no longer verifies, seen when the Backstage pod rolled while
the page stayed open) adds that reloading the page signs the tab back in, after
which Stop works. Tests cover the case that had no Stop at all before the
stalled-turn change: a task still `working` on the server whose state has not
moved for the age bound keeps Stop after a reload and when it goes stale under
the open page.
