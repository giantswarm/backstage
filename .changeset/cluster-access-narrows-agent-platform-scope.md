---
'@giantswarm/backstage-plugin-gs': minor
---

Let the sidebar Cluster access widget narrow the Agent Platform section.

Switching an installation off in the widget now removes it from the
installation selector in the Agent Platform page header, and the section stops
probing it: no `GET /apis` inventory read, and nothing on the Agents, Sessions,
Usage, Models or MCP Servers tabs queries it. Until now the fan-out already
skipped a switched-off installation, but the selector kept offering it — the
inventory answer is cached for an hour and survives the switch — so pinning it
emptied the whole section with nothing on the page saying why.

An installation pinned in the selector and then switched off falls back to
"All installations" rather than leaving every tab blank; the pin is cleared
from the URL and from local storage too. Switching an installation back on
restores it without re-probing, from the cached answer.

The Clusters page no longer records cluster-access status for a switched-off
installation. A cluster list already in flight when the switch was flipped used
to resolve afterwards and report the installation healthy again, quietly undoing
the switch until it was toggled a second time.
