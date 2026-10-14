---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Live round 2 fixes:

- An agent's question no longer offers _Decline_, which always failed ("A
  question cannot be rejected"): a question is answered, or left waiting. A
  permission request keeps _Allow_ and _Decline_.
- With several questions, "Question N still needs an answer." appears only
  after a blocked send, not on arriving at a question. _Send answer_ can be
  pressed while an earlier page is unanswered, and says which one.
- The edit-agent wizard always prefills from a fresh reading of the agent, so
  opening it right after a save shows the saved values, and the next save
  compares against them. Saving re-reads the agent straight away.
- The agent wizard's model card says "Environment default" (it said
  "Installation default"), on screen and to screen readers.
- A session opens at its newest turn instead of its top.
- The docked chat bar no longer lifts 24px when the conversation is scrolled
  to its end.
- The home screen titles the browser tab "New session · Agent Platform" instead
  of keeping the previous page's title.
- Lists that page with _Show more_ (including the wizard's Skills step) show a
  small remainder instead of hiding it behind a button, so there is no
  "Show 1 more skill".
