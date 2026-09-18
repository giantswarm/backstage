---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Session detail: a canceled turn says so. A turn stopped before the agent replied — by pressing Stop, or by the controller ending the run — rendered as the person's message followed by nothing, and since the header badge reads only the newest task, a cancel earlier in the session left no trace anywhere on the page. It now closes with an entry the way a failed turn does, worded as what it is rather than as an error: "This turn was canceled", with the controller's reason when it recorded one. The live stream ends a canceled turn on the same entry, so pressing Stop settles into what the poll is about to deliver instead of leaving a half-finished reply on screen.
