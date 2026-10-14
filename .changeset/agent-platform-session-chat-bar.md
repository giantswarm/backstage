---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The session view's chat works like a chat app's. The composer, its caption and
the cost chip are docked to the bottom of the view — at the bottom from the
first message on, staying put while the conversation scrolls behind them, and
above the shell's bottom bar at phone width. An agent's question or permission
request is answered in a compact card attached to the composer, directly above
the box: it prints the question, pages several questions one at a time
("Question 1 of N", sent together from the last page), and keeps its height to
about half the view; the conversation keeps the record of what was asked and
answered. Every run of tool calls now folds under its summary, a single call
included — "Used 1 tool", "Loaded 1 skill" or "Asked 1 agent" opens onto a list
of one, and a row onto its details, exactly as the multi-call case does.
