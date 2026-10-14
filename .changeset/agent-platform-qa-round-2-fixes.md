---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agent wizard and session fixes from QA round 2: over the 32-selector cap, the
Tools step no longer shows muster's raw "Could not resolve the toolset" dump
beside its own message; the Review step summarises tools in words (selectors
stay under Technical details) and shows no raw Harness name as the runtime;
a session's turn markers read "Turn N · <time>"; the session title's rename
hint is a native title instead of an MUI tooltip.
