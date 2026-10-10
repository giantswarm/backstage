---
'@giantswarm/backstage-plugin-agent-platform': minor
---

A session's chat reads like the prototype's: each run of the agent's work folds under one line — "✓ Used 3 tools ›" — that opens straight onto the exact trace (tool names, argument summary, each call's arguments and result as its own fold-out), collapsed once the turn is done. The page-wide "Timeline" heading and "Show technical details" switch are gone: technical detail is a fold-out in place, and a call outside a summary folds out its exact call on its own row. Under the composer the resting caption is "Agents can make mistakes. Check important results.", the waiting caption names the agent ("… is waiting for your decision above."), and the approval card says "Nothing is sent until you allow it." In the agent shell the session header gets a pin toggle, and a toast — "<Agent> is waiting for you · Open session" — appears when one of your sessions starts waiting on you while you are elsewhere in the shell.
