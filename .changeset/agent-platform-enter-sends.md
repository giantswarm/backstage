---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Enter sends. In the session reply composer and the new-session composer, Enter now
sends the message and Shift+Enter inserts a newline — the rule of Slack, Claude and
kagent's own UI, and the first thing people reached for; the earlier arrangement
(Enter for a newline, Cmd/Ctrl+Enter to send) came back as a bug report. Cmd/Ctrl+Enter
still sends, and an Enter that commits an IME composition is left alone.

The answer panel an agent's question opens can now be sent from the keyboard too:
Enter from a radio, a checkbox or the answer box sends the answer, where before only
the button did. In the reason box Enter confirms the decline rather than sending an
approval.
